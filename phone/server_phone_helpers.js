// intialize timezoneJs
timezoneJS.timezone.loadingScheme = timezoneJS.timezone.loadingSchemes.MANUAL_LOAD;
timezoneJS.timezone.zones = Timezones.zones;
timezoneJS.timezone.rules = Timezones.rules;

ServerPhoneHelpers = {
	// this will determine the user based on the query passed in from a GET request.
	// this will get all of the actions available for the current user and return them. 
	// this will append any defaults that are necessary as well.
	getUserVoicemailActions: function(query, phoneCallId) {
		var voicemailActions = [];

		if(phoneCallId) { // this is a Test call (outgoing to the user)
			PhoneCalls.update({_id: phoneCallId}, {
				$set: {
					'status': 'established'
				}
			});

			var phoneCall = PhoneCalls.findOne({_id:phoneCallId});

			voicemailActions = phoneCall.actionData; 
		} else {  

			var toNum = query.To;
			var fromNum = query.From; 

			toNum = PhoneHelpers.removeCountryCode(toNum);
			fromNum = PhoneHelpers.removeCountryCode(fromNum);

			// find with practice this number belongs to...  it could be in toNum or
			// fromNum!
			var practiceNum = toNum; 

			if(query.Direction.indexOf('outbound') > -1) {
				practiceNum = fromNum;
			}

			var practice = Practices.findOne({
				'voicemail_number': practiceNum
			});

			if(!practice) {  // no practice is lined up with this number yet... 
				return null;
			}
			
			if(practice.settings && practice.settings.voicemail) {
				voicemailActions = practice.settings.voicemail;
			}
		}
		// add defaults, incase any are missing
		voicemailActions = PhoneHelpers.addVoicemailDefaults(voicemailActions);

		return voicemailActions;
	}, 
	getUserVoicemailActionById: function(userVoicemailActions, voicemailActionId) {
		return _.findWhere(userVoicemailActions, {id:voicemailActionId});
	}, 
	/**
	 * This will get the action associated with a number pressed.  It is called
	 * from /twilio/digits.
	 * @param queryDigits the digits for the query passed straight from Twilio
	 * @param curUserVoicemailAction the current voicemail action the digits apply to
	 * @returns the action id the digits point to (inside of curUserVoicemailAction.nums), or null.
	 */
	getChosenActionId: function(queryDigits, curUserVoicemailAction) {
		var digit = parseInt(queryDigits); 

		var actions = curUserVoicemailAction.actions;
		var curActionId;

		// for 0-9
		curAction = _.findWhere(actions, {num:digit});
		if(curAction) {
			curActionId = curAction.id;
		}

		/*/ for #
		if(digit > 0 && actions && actions.length > 0 && actions[0].num == '#') {
			curActionId = actions[0].id;
		}*/

		return curActionId;
	}, 
	processRequest: function(request)
	{
		var query = request.query; 
		var body = request.body; 

		var protocol = 'https:';// : 'http:';
		var hippoData = ServerPhoneHelpers.getHippoData(query);
		var phoneCallId = hippoData.phoneCallId;
		var fromNum = phoneCallId ? query.To : query.From;  // if it's test, we use the "To" as the one who called
		var toNum = phoneCallId ? query.From : query.To; 

		if (body && body.From)
		{
			fromNum = phoneCallId ? body.To : body.From;  // if it's test, we use the "To" as the one who called
			toNum = phoneCallId ? body.From : body.To; 
		}

		fromNum = PhoneHelpers.removeCountryCode(fromNum);
		toNum = PhoneHelpers.removeCountryCode(toNum); 
		
		// make sure # is good beforehand
		
		if(hippoData.alternatePhone) {
			fromNum = hippoData.alternatePhone;
		}

		var practice = Practices.findOne({
			'voicemail_number': toNum
		});

		var practiceBlocksNumber = null;
		if (!hippoData.alternatePhone) practiceBlocksNumber = Practices.findOne({
			'voicemail_number': toNum,
			'settings.blocked_phones.number': fromNum
		});

		var numberBlocked = (fromNum == '+266696687' || practiceBlocksNumber);

	    var fromUser = Helpers.findUserByPhone(fromNum); 
	    var fromUserId = fromUser ? fromUser._id : null;
	    return {
	    	hippoData: hippoData,
	    	fromNum: fromNum,
	    	toNum: toNum,
	    	numberBlocked: numberBlocked,
	    	fromUserId: fromUserId,
	    	practice: practice
	    };
	},

	getHippoData: function(query) {
		var hippoData;

		if(!query.hippoData) { // this means it's a fresh call-in, and we need to determine what vmId to use based on time of day
			var toNum = query.To;
			toNum = PhoneHelpers.removeCountryCode(toNum);

			// determine Business Hours of After Hours
			var practice = Practices.findOne({
				'voicemail_number': toNum, 
				'settings.schedule': {
					$exists: true
				}
			}); 

			var schedule = practice ? practice.settings.schedule : [];
			var timezone = practice ? practice.settings.timezone : 'America/Los_Angeles';  // default

			var actionId = 'afterHours';

			// determine if during hours of after hours
			var practiceNowDate = new timezoneJS.Date(new Date(), timezone); 
			var weekday = PhoneHelpers.weekdays[practiceNowDate.getDay()];

			var hours = practiceNowDate.hours;
			var minutes = practiceNowDate.minutes; 
	
			var hoursMinutesTimestamp = ((hours * 60 * 60) + (minutes * 60)) * 1000;   // same equation used to calculate times in settings_practice.js
			var todaysSchedule = schedule[weekday];

			if(todaysSchedule && hoursMinutesTimestamp >= todaysSchedule.start && hoursMinutesTimestamp <= todaysSchedule.end) {
				actionId = 'businessHours';
			}
			
			hippoData =  {
				actionId: actionId
			}
		} else {
			hippoData = JSON.parse(query.hippoData);
		}

		return hippoData;
	}, 
	copyHippoData: function(hippoData) {
		var copy = {};

		for(var key in hippoData) {
			copy[key] = hippoData[key];
		}
		return copy;
	},
	attachHippoDataToUrl: function(hippoData, url) {

		return url + '?hippoData=' + encodeURIComponent(JSON.stringify(hippoData));
	}

}