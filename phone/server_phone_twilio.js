var Future = Npm.require("fibers/future");

twilio = null;

Meteor.startup(function() {
	var twilioSettings = ServerConfig.Twilio;//Meteor.settings.Twilio;

	// super account
	twilio = Twilio(twilioSettings.accountSid, twilioSettings.authToken);
});

var getUsersPractice = function () {
	if(!Meteor.user()) { return null; }

	var practice = Practices.findOne(Meteor.user().practice_id);
	if(!practice) { return null; }

	return practice;
}

// delete a Twilio number
Meteor.methods({
	'twilioGetPhoneNumbers': function(prefix) {
		var practice = getUsersPractice();
		if(!practice) { throw new Meteor.Error(403, 'Access Denied'); }

        var twilioCredentials = getPracticeTwilioCredentials(practice._id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

		var containsNum = prefix;
		/*
		for(var i = containsNum.length; i < 10; i++) {
			containsNum += '*';
		}*/

		var future = new Future();

		twilioSubaccount.availablePhoneNumbers("US").local.list({contains: containsNum}, function(err, numbers) {
			if(err) { future.return(err.message); }  // not sure how to throw Meteor.Error inside future...
			else {
				var phoneNumbers = [];

				for(var i = 0; i < numbers.available_phone_numbers.length; i++) {
					var curNum = numbers.available_phone_numbers[i];

					phoneNumbers.push({
						'friendly_name': curNum.friendly_name, 
						'phone_number': curNum.phone_number
					});
				}
				future.return(phoneNumbers);
			}			
		});

		return future.wait();

	}, 'twilioAddPhone': function(phoneNumber, host) {
		var practice = getUsersPractice();
		if(!practice) { return; }

        var twilioCredentials = getPracticeTwilioCredentials(practice._id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

		var future = new Future();

		var voiceUrl = 'https://www.hippoverse.com/twilio';
		var smsUrl = 'https://www.hippoverse.com/twilio/sms';

		if(host.indexOf('testing') > -1) {
			voiceUrl = 'https://testing.hippoverse.com/twilio';
			smsUrl = 'https://testing.hippoverse.com/twilio/sms';
		} else if(host.indexOf('localhost') > -1  || host.indexOf('pagekite') > -1) {
			voiceUrl = 'https://' + twilioTestHost + '/twilio';
			smsUrl = 'https://' + twilioTestHost + '/twilio/sms';
		}

		twilioSubaccount.incomingPhoneNumbers.create({
			friendlyName: practice.name, 
			phoneNumber: phoneNumber, 
			voiceUrl: voiceUrl, 
			voiceMethod: 'GET', 
			smsUrl: smsUrl, 
			smsMethod: 'GET'
		}, Meteor.bindEnvironment(function(err, number) {

			if(err) { future.return(err.message); }
			else {

				Practices.update(practice._id, {
					$set: {
						'voicemail_number': phoneNumber.replace('+1', '')
					}
				});

				future.return(true);
			}
		}, function(e) {
			console.log('error binding', e);
		}));

		return future.wait();
	}, 'twilioAddPhoneForUser': function(phoneNumber, host) {
		var practice = getUsersPractice();
		if(!practice) { return; }

        var twilioCredentials = getPracticeTwilioCredentials(practice._id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

		var future = new Future();

		var voiceUrl = 'https://www.hippoverse.com/twilio';
		var smsUrl = 'https://www.hippoverse.com/twilio/sms';

		if(host.indexOf('testing') > -1) {
			voiceUrl = 'https://testing.hippoverse.com/twilio';
			smsUrl = 'https://testing.hippoverse.com/twilio/sms';
		} else if(host.indexOf('localhost') > -1  || host.indexOf('pagekite') > -1) {
			voiceUrl = 'https://' + twilioTestHost + '/twilio';
			smsUrl = 'https://' + twilioTestHost + '/twilio/sms';
		} 

		var user = Meteor.user(); 

		twilioSubaccount.incomingPhoneNumbers.create({
			friendlyName: practice.name + ' - ' + user.profile.name, 
			phoneNumber: phoneNumber, 
			voiceUrl: voiceUrl, 
			voiceMethod: 'GET', 
			smsUrl: smsUrl, 
			smsMethod: 'GET'
		}, Meteor.bindEnvironment(function(err, number) {

			if(err) { future.return(err.message); }
			else {
				phoneNumber = phoneNumber.replace('+1', ''); 

				// insert into user phones
				Meteor.users.update(Meteor.userId(), {
					$addToSet: {
						'profile.phones': Helpers.createProfilePhoneEntry(phoneNumber, 'twilio', true)
					}
				}); 

				future.return(true);
			}
		}, function(e) {
			console.log('error binding', e);
		}));

		return future.wait();
	}, 'twilioListCalls': function() {
		var practice = getUsersPractice();
		if(!practice) { return; }

        var twilioCredentials = getPracticeTwilioCredentials(practice._id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

		var future = new Future();
		//startTime>": "2009-07-06"
		var d = new Date();
		d.setDate(d.getDate() - 7);
		var timeStr = d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate();
		
		var getNotifications = function(callList)
		{
			twilioSubaccount.notifications.list({
				"messageDate>": timeStr,
				log: "0"
				}, Meteor.bindEnvironment(function(err, list) {
					//console.log(list.notifications);

				if(err) { future.return(err.message); }
				else {
					var notifications = list.notifications;
					var callsAndNotifications = _.map(callList, function(call){
						var notificationsForCall = _.where(notifications, {call_sid: call.sid});
						call.notifications = notificationsForCall;
						return call;
					})

					future.return(callsAndNotifications);
				}
			}, function(e) {
				console.log('error binding', e);
			}));
		}

		

		twilioSubaccount.calls.get({
			"startTime>": timeStr
			}, Meteor.bindEnvironment(function(err, list) {

			if(err) { future.return(err.message); }
			else {
				var calls = list.calls;
				

				getNotifications(calls);
			}
		}, function(e) {
			console.log('error binding', e);
		}));

		return future.wait();
	},  'twilioDeletePhone': function() {
		var practice = getUsersPractice();
		if(!practice) { return; }
        var twilioCredentials = getPracticeTwilioCredentials(practice._id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

		// prepend +1 for US country-code
		var practicePhoneNumber = '+1' + practice.voicemail_number;
		Practices.update(practice._id, {$unset:{voicemail_number:1}});
		twilioSubaccount.incomingPhoneNumbers.list(function(err, data) {
			data.incomingPhoneNumbers.forEach(function(number) {

				if(practicePhoneNumber == number.phone_number) {
					var numUri = number.uri.replace('.json', ''); 
					// delete it!
					console.log(numUri);
					Fiber(function() {

						HTTP.del('https://api.twilio.com' + numUri, {
							auth: twilioCredentials.sid + ':' + twilioCredentials.authToken
						}, function(err, data) {
							
						});

					}).run();

					return;
				}
			}); 
		});
	}, 'twilioDeletePhoneForUser': function() {/*
		var practice = getUsersPractice();
		if(!practice) { return; }

        var twilioCredentials = getPracticeTwilioCredentials(practice._id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

		// prepend +1 for US country-code
		var userPhoneNumber = '+1' + practice.voicemail_number;

		twilioSubaccount.incomingPhoneNumbers.list(function(err, data) {
			data.incomingPhoneNumbers.forEach(function(number) {

				if(practicePhoneNumber == number.phone_number) {
					var numUri = number.uri.replace('.json', ''); 
					// delete it!
					Fiber(function() {

						HTTP.del('https://api.twilio.com' + numUri, {
							auth: twilioCredentials.sid + ':' + twilioCredentials.authToken
						}, function(err, data) {

						});

					}).run();

					return;
				}
			}); 
		});


		// remove the phone # from the user*/

	}
});