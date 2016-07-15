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
  // if (req.params.objectId != null) {
  //   console.log(req.params.objectId);
  // }
  // query.equalTo("objectId", req.params.objectId);
  // query.find({
  //   success: function(result) {
  //     if (result.length)
  //     res.success(result[0]);
  //   },
  //
  //   error: function(error) {
  //     res.error(error);
  //   }
  // });

});

Parse.Cloud.define('requestChargeEstimate', function(request, response){

});