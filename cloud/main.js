// TODO: get this value from a server parameter not hard coded!
var stripe = require("stripe")(
    "sk_test_A9QMRVzF28BbkDdEDBlo8JhH"
);
Parse.Cloud.define('hello', function(req, res) {
  res.success('Hi');
});

/* Passengers need to make a request and be placed in a waiting queue. 
   We ensure the user doesn't have any pending requests.  

   Requests can be cancelled iff it doesn't have a charge / doesn't have a pickup time. 

   if the user hasn't been assigned a captain, doesn't have a charge or pickup time, then they can cancel the request. 
*/
Parse.Cloud.define('createRequest', function(request, response){
  var Request = new Parse.Object.extend("Request");
  var newRequest = new Request();
  if (request.params.userId != null) {

  }
});

Parse.Cloud.define('getAllProducts', function(request, response){
  var Products = new Parse.Object.extend("Products");
  var query = new Parse.Query(Products);
  query.find({
    success: function(products) {
      response.success(products);
    },
    error: function(error) {
      response.error(error);
    }
  });
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
Parse.Cloud.define('pickupRequest', function(request, response){
  console.log(request.params);
  if(request.params.requestId != null && request.params.userId != null) {
    var promise = new Parse.Promise();
    var captainUser;
    var pickupRequest;
    findUserById(request.params.userId).then(function(user){
      console.log(user);
      captainUser = user;
      return findRequestById(request.params.requestId);
    }).then(function(object){
      pickupRequest = object;
      pickupRequest.set("captain", captainUser);
      pickupRequest.set("pickupTime", new Date());
      return pickupRequest.save();
    }).then(function(savedRequest){
      response.success(savedRequest);
    }, function(error){
      response.error(error);
    });
  } else {
    response.error("Required parameters 'requestId' and 'userId' not given");
  }
  
})

Parse.Cloud.define('getRequest', function(request, response){
  if (request.params.requestId != null) {
    findRequestById(request.params.requestId).then(function(requestObject){
      response.success(requestObject);
    }, function(error){
      response.error("Object with ID " + request.params.requestId + " does not exist");
    });
  } else {
    response.error("Request ID was not given");
  }

});

Parse.Cloud.define('getAllRequests', function(request, response){
  var Request = Parse.Object.extend("Request");
  var query = new Parse.Query(Request);
  query.include("requester");
  query.include("product");
  query.equalTo("cancelled", false);
  query.doesNotExist("captain"); 

  query.find({
    success: function(results) {
      response.success(results);
    }, 
    error: function(error) {
      response.error(error);
    }
  });
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
  var charge = new Parse.Object.extend("Charge");
  findUserById(request.params.userId).then(function(userObject){
    // got requester user
    console.log("got user");
    console.log(userObject);

    user = userObject;
    return user;
  }).then(function() {
    return findUserById(request.params.captainId)
  }).then(function(captainObject){
    // got a captain
    console.log("got captain");
    console.log(captainObject);
    captain = captainObject;
    var checkCaptainStatus = new Parse.Promise();
    if (captain.get("captainStatus") == null || captain.get("captainStatus") == false) {
      throw "Tried to assign a non-captain user to a request.";
    }
    return findRequestById(request.params.requestId);
  }).then(function(requestObject) {
    // find request by id
    console.log(requestObject.get("pickupTime"));
    console.log(requestObject.get("id"));
    console.log(requestObject.get("chargeCompleted"));
    if (requestObject.get("pickupTime") == null){
      throw "Request has not been picked up yet so it cannot be charged"
    }
    if (requestObject.get("chargeCompleted") == true && requestObject.get("chargeCompleted") != null) {
      throw "This request has already been completed and was charged " + requestObject.get("chargeAmount") + ".  The request was completed on " + requestObject.get("dropoffTime");
    }
    console.log("request found");
    console.log(requestObject);
    userRequest = requestObject;
        // a captain may retry to charge the passenger if the first attempt fails (stripe customer failures, etc.). 
    // save the initial request dropoffTime
    if (userRequest.get("dropoffTime") == null) {
      // don't reset the dropoff time
      userRequest.set("dropoffTime", new Date());
    }
    
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
    if (userRequest.get("product") == null) {
      throw "User did not select a product so we cannot calculate a charge";
    }
    console.log(userRequest.get("pickupTime"));
    console.log(userRequest.get("dropoffTime"));
    console.log(new Date(userRequest.get("dropoffTime")) - new Date(userRequest.get("pickupTime")));
    var totalTime = (new Date(userRequest.get("dropoffTime")) - new Date(userRequest.get("pickupTime")))/1000/60/60;
    var chargeTotal = Math.round(totalTime * product.get("price")*100)/100;
    charge.set("totalCharge", chargeTotal);
    return charge.save();
  }).then(function(chargeObject){
    this.charge = chargeObject;
    console.log(chargeObject);
    userRequest.set("chargeAmount", chargeObject.get("totalCharge"));
    userRequest.set("charge", chargeObject);
    return userRequest.save();
  }).then(function(requestObject) {
    return lookupStripeCustomer(request.params.userId);
  }).then(function(stripeCustomer){
    console.log(stripeCustomer);
    return stripeCustomer;
  }).then(function(customer){
    console.log(customer);
    if (customer.id == null ){
      throw "the customer with id " + request.params.objectId + " does not exist"
    }
    return chargePassenger(userRequest.get("chargeAmount"), customer.id);
  }).then(function(charge){
    console.log(charge);
    userRequest.set("chargeCompleted", true);
    console.log(userRequest);
    return userRequest.save();
  }).then(function(userRequest){
    console.log(userRequest);
    response.success(userRequest);
  }, function(error){
    console.log(error);
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

function chargePassenger(amount, customerId) {
  var promise = new Parse.Promise();
  // lookup user on stripe and verify they have a valid payment method.
  // stripe requires all charges to be converted to "cents"
  var surcharge = 40;
  var chargeInCents = Math.floor((amount+surcharge) * 100);
  stripe.charges.create({
    amount:chargeInCents,
    currency: "usd",
    customer: customerId
  }, function(err, charge){
    if (err == null) {
      promise.resolve(charge);
    } else {
      promise.reject(err);
    }
  });
  return promise;
}

function lookupStripeCustomer(customerId) {
  var promise = new Parse.Promise();
  stripe.customers.retrieve(customerId, function(err, customer){
    if (err == null) {
      promise.resolve(customer);
    } else {
      promise.reject(err);
    }
  });
  return promise;
}

function findProductById(id) {
  var promise = new Parse.Promise();
  var RequestClass = Parse.Object.extend("Products");
  var request = new RequestClass();
  var query = new Parse.Query(request);
  query.get(id, {
    success: function(requestObject) {
      promise.resolve(requestObject);
    },
    error: function(error) {
        console.log(error);
      promise.reject("Request with id "+id+" does not exist" + error);
    }
  });
  return promise;
}

function findRequestById(id) {
  var promise = new Parse.Promise();
  var RequestClass = Parse.Object.extend("Request");
  var request = new RequestClass();
  var query = new Parse.Query(request);
  query.equalTo("objectId", id);
  query.include("product");
  query.include("requester");
  query.include("captain");
  query.get(id, {
    success: function(object) {
      console.log("findRequestByID found object");
      console.log(object);
      promise.resolve(object);
    },
    error: function(error) {
      promise.reject(error);
    }
  });
  // query.find({
  //   success: function(results) {
  //     console.log(results.length);
  //     promise.resolve(results);
  //   },
  //   error: function(error) {
  //     console.log(error);
  //     promise.reject(error);
  //   }
  // });
  return promise;
}

function findUserById(id) {
  console.log("Finding user with id " + id);
  Parse.Cloud.useMasterKey();
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