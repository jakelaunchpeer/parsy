Parse.Cloud.define('hello', function(req, res) {
  res.success('Hi');
});

Parse.Cloud.define('requestCharge', function(req, res){
  console.log(req);
  var query = new Parse.Query("Requests");
  query.get(req.params.objectId, {
    success: function(result) {
      console.log(result)
      var pickupDate = new Date.parse(result.pickup_time);
      console.log(pickupDate);
      console.log(pickupDate.getDay());

      // var pickupDateUTC = Date.UTC(pickupDate.getYear(), pickupDate.getMonth(), pickupDate.getDay(), pickupDate.getHours(), pickupDate.getMinutes());
      // console.log(pickupDateUTC);
      // console.log(pickupDate);
      // var pickupTimeHours = Date(result.pickup_time).getUTCHours();
      // var pickupTimeMinutes = Date(result.pickup_time).getUTCMinutes() / 60;
      // console.log(pickupTimeHours);
      // console.log(pickupTimeMinutes);
      res.success(result);
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