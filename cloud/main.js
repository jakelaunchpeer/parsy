var stripe = require("stripe")(
    "sk_test_A9QMRVzF28BbkDdEDBlo8JhH"
);
Parse.Cloud.define('hello', function(req, res) {
  res.success('Hi');
});

Parse.Cloud.define('requestCharge', function(req, res){
  console.log(req);
  var query = new Parse.Query("Requests");
  query.get(req.params.objectId, {
    success: function(result) {
      if (result.get("pickup_time") != null && result.get("completed_time") != null) {
        var pickupDate = new Date(result.get("pickup_time"));
        var utcPickupHours = pickupDate.getUTCHours() + (pickupDate.getUTCMinutes() / 60);
        var completionDate = new Date(result.get("completed_time"));
        var utcCompletionDateHours = completionDate.getUTCHours() + (completionDate.getUTCMinutes() / 60);
        var difference = utcCompletionDateHours - utcPickupHours;
        res.success({"charge":difference*100});
      } else {
        res.error("pickup time or completed time not set");
      }
    },

    error: function(error) {
      res.error(error);
    }
  });
});

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