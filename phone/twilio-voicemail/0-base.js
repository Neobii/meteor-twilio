
/**
 * This will be called when 1.) Call is incoming and 2.) Calls is ended.
 * Note that if 1.) Call is outgoing and 2.) Call is ended, go to /server/twilio-phone/end-call.js.
 */
 Router.map(function () {
  this.route('twilioStatus', {
  path: '/twilio/status',
  where: 'server',
  action: function(){
  	var query = this.request.query; 

  	if(query.CallSid) {
  		var call = Calls.findOne({
  			external_call_sid: query.CallSid
  		}); 
  		if(call) {
  			Calls.update(call._id, {
  				$set: {
  					status: 'completed', 
  					end_call: null
  				}
  			});
  		}
  	}
  	
  	var twilioResponse = new Twilio.TwimlResponse(); 
    this.response.writeHead(200, {'Content-Type': 'text/xml'});
    this.response.end(twilioResponse.toString());
  }}); 
});
 
Router.map(function () {
  this.route('twilioVerifyPractice', {
  path: '/twilio/verify/:practicePath',
  where: 'server',
  action: function(){
  	var practicePath = this.params.practicePath;

    var protocol = /*request.headers.host.indexOf('hippoverse.com') > -1 ?*/ 'https:';// : 'http:';

    var practice = Practices.findOne({path:practicePath});
    if (!practice) throw new Meteor.Error(0, "Could not find practice");

	// this is the twilio response object that will generate the TwiML
	  var twilioResponse = new Twilio.TwimlResponse(); 

    // Outgoing call from the server, when the user answers
    if(!this.request.body.Digits) { 
    	// TEST
    	practicePath += 'z';
    	// END OF TEST

		twilioResponse.gather({
			action: protocol + '//' + this.request.headers.host + '/twilio/verify/' + practicePath, 
			method: 'POST', 
			numDigits: 1
		}, function() {
			this.say('Please press 1 to verify your account for ' + practice.name + '.  Otherwise, feel free to hang up.');
		});

	} else {  // User presses digits
		var digits = this.request.body.Digits; 

		twilioResponse.say('Thank you.');

		if(digits == '1') {
			twilioResponse.say('Your conversation should now go through...  Please check your web browser to make sure this is correct.  Have a nice day.')

			// update phone verified for incoming
			var toNum = this.request.body.To;
			toNum = PhoneHelpers.removeCountryCode(toNum);

			var user = Meteor.users.findOne({
				'profile.phones.number': toNum
			});

			if(user) {
				Meteor.users.update(user._id, {
					$set: {
						'profile.phone_verified': true
					}
				});
			}
		}
	}

    this.response.writeHead(200, {'Content-Type': 'text/xml'});
    this.response.end(twilioResponse.toString());
  }
  });
});