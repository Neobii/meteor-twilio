var spawn = Npm.require('child_process').spawn;
var Future = Npm.require("fibers/future");

twilioTestHost = process.env.PAGEKITE_HOST ? process.env.PAGEKITE_HOST : 'hippoverse.pagekite.me'; 


getPracticeTwilioCredentials = function(practiceId) {
    var twilioSettings = ServerConfig.Twilio;

    var practice = Practices.findOne(practiceId);
    if(!practice) { return null; }

    if(!practice.twilio_account_sid || !practice.twilio_auth_token) {
        var future = new Future(); 

        // super-account
        var restClient = Twilio(twilioSettings.accountSid, twilioSettings.authToken); 

        // create subaccount
        restClient.accounts.create({
            friendlyName: practice.name
        }, Meteor.bindEnvironment(function(err, account) {

            if(err) { console.log(err.body); return; } // TODO: alert us!

            accountSid = account.sid;

            // update Practice
            Practices.update(practice._id, {
                $set: {
                    twilio_account_sid: account.sid, 
                    twilio_auth_token: account.auth_token
                }
            });
            future.return({
                sid: account.sid, 
                authToken: account.auth_token
            });

        }, function(err) {
            console.log('error binding environment', err);
        }));

        return future.wait();
    }

    return {
        sid: practice.twilio_account_sid, 
        authToken: practice.twilio_auth_token
    };
}

Meteor.startup(function() {
/*    var twilioSettings = ServerConfig.Twilio;

    var accountSidsToClose = [
        'AC3E8F840D3BCDD8FF1692EA82A9CCE1AA', 
        'AC44C4A0C5E894769791AB22DFAB582C41'
    ];

    // super account
    var restClient = Twilio(twilioSettings.accountSid, twilioSettings.authToken); 

    for(var i = 0; i < accountSidsToClose.length; i++) {
        restClient.accounts(accountSidsToClose[i]).update({
            status: 'closed'
        }, function(err, account) {
            if(err) { console.log(err.body); return; }
        });
    }*/
});

var devAppSid = null; 

var updateTwilioPhoneNumberParameters = function(voicemailNumber, twilioCredentials, baseUrl) {
    var twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

    // update voiceUrl and smsUrl
    twilioSubaccount.incomingPhoneNumbers.list({phoneNumber:voicemailNumber}, function(err, data) {
        var incomingPhoneNumbers = data.incoming_phone_numbers;
        incomingPhoneNumbers.forEach(function(phoneData) {

            twilioSubaccount.incomingPhoneNumbers(phoneData.sid).update({
                voiceUrl: baseUrl + '/twilio', 
                voiceMethod: 'GET', 
                voiceFallbackUrl: baseUrl + '/twilio/fallback', 
                voiceFallbackMethod: 'GET', 
                statusCallback: baseUrl + '/twilio/status', 
                statusCallbackMethod: 'GET', 
                smsUrl: baseUrl + '/twilio/sms', 
                smsMethod: 'GET'
            });
        });
    });
}

var getDevAppSid = function() {

    // update practice's phone number URLs
    var user = Meteor.users.findOne(Meteor.userId());
    var practice = Practices.findOne(user.practice_id);

    if(practice.voicemail_number) {
        var future = new Future();

        var twilioCredentials = getPracticeTwilioCredentials(user.practice_id);

        var twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

        // create Phone app if necessary
        var appParams = {
            friendlyName: 'Phone - Dev', 
            voiceUrl: 'https://' + twilioTestHost + '/twilio/phone', 
            voiceMethod: 'GET'
        }


        twilioSubaccount.applications.list(function(err, data) {
            if(data.total == 0) {
                twilioSubaccount.applications.create(appParams, function(err, app) {
                    future.return(app.sid);
                });
            } else {
                var appSid = data.applications[0].sid;

                twilioSubaccount.applications(appSid).update(appParams, function(err, app) { 
                    future.return(appSid);
                }); 
            }
        });

        return future.wait(); 
    } else {
        return null;
    }

}

Meteor.methods({
    'twilio_capability': function(host, device) {
        var user = Meteor.users.findOne(Meteor.userId());
        if(!user) { return; } 

        var practice = Practices.findOne(user.practice_id);

        twilioCredentials = getPracticeTwilioCredentials(user.practice_id);

        // determine the sid to use
        var isDev = false;
        var appSid = ServerConfig.Twilio.twimlApps.phone.production;

        if(host.indexOf('localhost') > -1 || host.indexOf('pagekite') > -1 || host.indexOf(':3000') > -1) {
            appSid = getDevAppSid(); // for funneling twilio calls here
            isDev = true;
        } else if(host.indexOf('testing') > -1) {
            appSid = ServerConfig.Twilio.twimlApps.phone.testing;
        }

        // asynchronously update Twilio phone number URLs
        if(practice.voicemail_number) {
            var baseUrl = 'https://www.hippoverse.com';

            if(isDev) {
                baseUrl = 'https://' +twilioTestHost;
            } else {
                if(host.indexOf('testing') > -1) {
                    baseUrl = 'http://testing.hippoverse.com:50000';
                }
            }

            updateTwilioPhoneNumberParameters(practice.voicemail_number, twilioCredentials, baseUrl);
        }

        // using subaccount
        var capability = new Twilio.Capability(twilioCredentials.sid, twilioCredentials.authToken);
        
        capability.allowClientOutgoing(appSid);
        capability.allowClientIncoming(user._id + '_' + device);

        var token = capability.generate(); 

        return {
            token: token
        };
    }
});

