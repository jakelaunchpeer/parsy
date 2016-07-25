// TODO: get this value from a server parameter not hard coded!
var stripe = require("stripe")(
    "sk_test_A9QMRVzF28BbkDdEDBlo8JhH"
);
Parse.Cloud.define('hello', function(req, res) {
  res.success('Hi');
});
/*
 * Marks when the captain drops off passengers.  UTC server timestamp is used for this value.
 * Parameter: requestId (objectId of the request object).
 */
Parse.Cloud.define('dropoffRequest', function(request, response){
    if (request.params.requestId != null) {
        var params = request.params;
        var userRequest;
        findRequestById(params.requestId).then(function(requestObject) {
            userRequest = requestObject;
            userRequest.set("drop_off_time", new Date());
            return userRequest.save();
        }).then(function(requestObject) {
            userRequest = requestObject;
            response.success(requestObject);
        }, function(error) {
            response.error(error);
        });
    } else {
        response.error("Required parameters not met");
    }
});

/*
 * Use the server's timestamp to deter clock manipulation on client.  Prevents captains from fast forwarding clock.
 * Also eliminates time zone issues all times are UTC server time.
 */
Parse.Cloud.define('pickupRequest', function(request, response) {
  // to ensure fairness we allow the server to set timestamps for pickup and delivery of people.
  // prevents users from manipulating timestamps by changing devices time
    if (request.params.requestId != null) {
        findRequestById(request.params.requestId).then(function(requestObject) {
            requestObject.set("pickup_time", new Date());
            return requestObject.save();
        }).then(function(result) {
            response.success(result);
        }, function(error) {
            response.error(error);
        });
    } else {
        response.error("Request parameters not met");
    }
});
/*
* Calculates a charge for the passenger.  Calculation is based on a per hour rate defined in the product model
* The calculation is rounded to nearest 100th decimal using the round function.
*   Example: 3.983 => 3.98
*   Currency in USD
*   Round formula Math.round((totalTime * cost_product * 100)/100)
*
// TODO: This should invoke the Stripe API and charge the user.
 *
 * Creates a charge request for a passenger.  We tie Parse User ObjectID's to the Stripe ID when creating a customer.
 * Use the Parse User ID to retrieve/charge a Stripe Customer.
 */
Parse.Cloud.define('createCharge', function(request, response) {
  // captainID
  // passengerID
  // product ID
  // lookup captain object
  var user;
  var captain;
  var userRequest;
  var product;
  findUserById(request.params.userId).then(function(userObject){
    // got requester user
    user = userObject;
    return user;
  }).then(function() {
    return findUserById(request.params.captainId)
  }).then(function(captainObject){
    // got a captain
    captain = captainObject;
      var checkCaptainStatus = new Parse.Promise();
      if (captain.get("captain_status") == null || captain.get("captain_status") == false) {
          return checkCaptainStatus.reject("Non-Captains cannot make charges to users");
      }
    return findRequestById(request.params.requestId)
  }).then(function(requestObject) {
    // find request by id
    userRequest = requestObject;
    userRequest.set("drop_off_time", new Date());
    return findProductById(request.params.productId);
  }).then(function(productResult) {
    // got the product
    product = productResult;
    console.log(product);
    // add charge to product and save
    var Charge = Parse.Object.extend("Charge");
    var charge = new Charge();

    charge.set("product", product);
    charge.set("passenger", user);
    charge.set("captain", captain);
    // calculate total charge
    console.log(userRequest.get("pickup_time"));
    console.log(userRequest.get("drop_off_time"));
    console.log(new Date(userRequest.get("drop_off_time")) - new Date(userRequest.get("pickup_time")));
    var totalTime = (new Date(userRequest.get("drop_off_time")) - new Date(userRequest.get("pickup_time")))/1000/60/60;
    var chargeTotal = Math.round(totalTime * product.get("price")*100)/100;
    charge.set("total_charge", chargeTotal);
    return charge.save();
  }).then(function(chargeObject){
    console.log(chargeObject);
    userRequest.set("charge", chargeObject);
    return userRequest.save();
  }).then(function(requestObject) {
    console.log(requestObject);
    response.success(requestObject);
  }, function(error) {
    response.error(error);
  });
});
/*
* Creates a customer on stripe.  If customer already exists it will update their payment information with the new credit
* card. Use Parse User ObjectID to set the Customer ID for a Stripe customer.  ObjectID's are guaranteed unique as per
* MongoDB documentation.  Collision shouldn't be a problem here.
* */
Parse.Cloud.define('createCustomer', function(request, response){
  Parse.Cloud.useMasterKey();
  var params = request.params;
  if(params.objectId != null && params.exp_month != null && params.exp_year != null && params.number != null && params.cvc != null) {
    var query = new Parse.Query(Parse.User);
    query.get(params.objectId, {
      success: function(user) {
        // user retrieved check for current card
        if(user.default_card == null) {
          // customer doesn't have card create them and add card
          stripe.customers.create({
            id:params.objectId,
            source: {
              object:"card",
              exp_month:params.exp_month,
              exp_year:params.exp_year,
              number:params.number,
              cvc:params.cvc
            }
          }, function(error, customer){
            if (error == null) {
              user.set("default_card", customer.default_source);
              user.set("card", customer.sources.data[0].last4);
              user.save(null, {
                success: function(user) {
                  response.success({"customer":customer, "user":user});
                },
                error: function(error) {
                  response.error(error);
                }
              });
            } else {
              // error try update customer
              stripe.customers.update(params.objectId, {
                source: {
                  object:"card",
                  exp_month:params.exp_month,
                  exp_year:params.exp_year,
                  number:params.number,
                  cvc:params.cvc
                }
              }, function(error, customer){
                if (error == null) {
                  user.set("default_card", customer.default_source);
                  user.set("card", customer.sources.data[0].last4);
                  user.save(null, {
                    success: function(user) {
                      response.success({"customer":customer, "user":user});
                    },
                    error: function(error) {
                      response.error(error);
                    }
                  });

                } else {
                  response.error(error);
                }
              });
            }
          });
        } else {
          // update default card for user
          stripe.customers.update(params.objectId, {
            source: {
              object:"card",
              exp_month:params.exp_month,
              exp_year:params.exp_year,
              number:params.number,
              cvc:params.cvc
            }
          }, function(error, customer){
              if (error == null) {
                // update user
                user.set("default_card", customer.default_source);
                user.set("card", customer.sources.data[0].last4);
                user.save(null, {
                  success: function(user) {
                    response.success({"customer":customer, "user":user});
                  },
                  error: function(error) {
                    response.error(error);
                  }
                });
              }
          });
        }
      },
      error: function(error) {
          console.log(error);
        response.error("User with ID " + params.objectId + " does not exist!");
      }
    });
  } else {
      response.error("Required parameter not met");
  }
});

Parse.Cloud.define('requestChargeEstimate', function(request, response){

});

function findProductById(id) {
  var promise = new Parse.Promise();
  var RequestClass = Parse.Object.extend("Product");
  var request = new RequestClass();
  var query = new Parse.Query(request);
  query.get(id, {
    success: function(requestObject) {
      promise.resolve(requestObject);
    },
    error: function(error) {
        console.log(error);
      promise.reject("Request with id "+id+" does not exist");
    }
  });
  return promise;
}

function findRequestById(id) {
  var promise = new Parse.Promise();
  var RequestClass = Parse.Object.extend("Request");
  var request = new RequestClass();
  var query = new Parse.Query(request);
  query.include("product");
  query.get(id, {
    success: function(requestObject) {
      promise.resolve(requestObject);
    },
    error: function(error) {
        console.log(error);
      promise.reject("Request with id "+id+" does not exist");
    }
  });
  return promise;
}

function findUserById(id) {
  console.log("Finding user with id " + id);
  var query = new Parse.Query(Parse.User);
  var promise = new Parse.Promise();
  query.get(id, {
    success: function(user) {
      promise.resolve(user);
    },
    error: function(error) {
        console.log(error);
      promise.reject("User with id " + id + " does not exist");
    }
  });

  return promise;
}