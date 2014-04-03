Meteor.methods({
	/**
	 * This is used to verify a user's phone number.  It updates the profile.phone_verified 
	 * field of the phone number passed in if/when it's verified.
	 */
	verifyPhone: function(options) {
		// redirect localhost to localtunnel
		if(options.host.indexOf('localhost') > -1 || options.host.indexOf('pagekite') > -1) {
			options.host = twilioTestHost;
		}

		// get the practice at practicePath
        var practice = Practices.findOne({path:options.practicePath});
        if (!practice) throw new Meteor.Error(0, "Could not find practice");

        var voicemailNumber = practice.voicemail_number;
        if(!voicemailNumber) throw new Meteor.Error(0, "There is no voicemail number for this practice"); 

        //TODO: determine practice country code
        var fromNumber = '+1' + voicemailNumber;  // assuming US
        var toNumber = '+' + options.countryCode + options.phone;

		twilio.makeCall({
        	to: toNumber, 
        	from: fromNumber, 
        	url: options.protocol + '//' + options.host + '/twilio/verify/' + options.practicePath
		})
	}, 
	testVoicemail: function(options) {
		var toNum = '+1' + options.toNum;  // assuming US
		var actionData = options.actionData; 
		var actionId = options.actionId; 
		var host = options.host;
		var protocol = options.protocol;

		var phoneCallId = PhoneCalls.insert({
			userId: Meteor.userId(), 
			status: 'calling', 
			actionData: actionData
		}); 

		var practice = Practices.findOne({_id:Meteor.user().practice_id});
 
		var fromNum = '+1' + practice.voicemail_number;

		// for testing
		if(host.indexOf('localhost') > -1  || host.indexOf('pagekite') > -1) {
			host = twilioTestHost;
		}

		var callbackUrl = protocol + '//' + host + '/twilio/';

		var hippoData = {
			phoneCallId: phoneCallId, 
			actionId: actionId
		}
		callbackUrl = ServerPhoneHelpers.attachHippoDataToUrl(hippoData, callbackUrl);

		var statusCallbackUrl = protocol + '//' + host + '/twilio/status?phoneCallId=' + phoneCallId;


		twilio.makeCall({
			to: toNum, 
			from: fromNum, 
			url: callbackUrl, 
			method: 'GET', 
			statusCallback: statusCallbackUrl, 
			statusCallbackMethod: 'GET'
		});

		return phoneCallId; 
	}
}); 
