var Future = Npm.require("fibers/future");

Meteor.methods({
	'getParentCallSid': function(callSid) {
		var future = new Future();

        var user = Meteor.users.findOne(Meteor.userId());
        if(!user) { return; } 

        var practice = Practices.findOne(user.practice_id);

        var twilioCredentials = getPracticeTwilioCredentials(user.practice_id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

    	twilioSubaccount.calls(callSid).get(function(err, call) {
    		if(err) { future.err(err); return; }

    		future.return(call.parent_call_sid ? call.parent_call_sid : callSid);
    	});

    	return future.wait(); 
	},
	/**
	 * Steps in forward:  
	 * 		1. Attempt directly to the device(s)
	 *		2. If /end-call is called, put them on hold for up to 45 seconds. 
	 *		3. If after 45 seconds no answer, go back to /end-call and forward to voicemail.
	 *		4. Once user opens app, redirect call directly to devices.
	 */
	'twilioForward': function(origin, callId, clientId) {
		var future = new Future(); 

        var user = Meteor.users.findOne(Meteor.userId());
        if(!user) { return; } 

        var call = Calls.findOne(callId); 

        var setDic = { 
    		status: 'forwarding'
    	}; 
    	if(!call.answered_by) { // mark current user as answered_by
    		setDic['answered_by'] = Meteor.userId();
    	}

        Calls.update(call._id, {
        	$set: setDic
        });

		// for testing
		if(origin.indexOf('localhost') > -1  || origin.indexOf('pagekite') > -1 || origin.indexOf(':3000')) { 
			origin = 'https://' + twilioTestHost;
		}

        var practice = Practices.findOne(user.practice_id);

        var twilioCredentials = getPracticeTwilioCredentials(user.practice_id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

    	// external_call_sid will always have the right call_sid
    	twilioSubaccount.calls(call.external_call_sid).update({
    		url: origin + '/twilio/forward/' + clientId + '/call-id/' + callId, 
    		method: 'GET'
    	}, function(err, call) {
    		if(err) { 
    			console.log(err, call);
    			future.err(err); return;
    		}

    		future.return();
    	});

		return future.wait(); 
	}, 
	'checkCallSidStatus': function(callSid) {
		var future = new Future(); 

        var user = Meteor.users.findOne(Meteor.userId());
        if(!user) { return; } 

        var twilioCredentials = getPracticeTwilioCredentials(user.practice_id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

    	twilioSubaccount.calls(callSid).get(function(err, call) {
    		if(err) {
    			console.log(err, call);
    			future.err(err); return;
    		}
    		future.return(call.status);
    	});

		return future.wait(); 
	}
});

Router.map(function () {
  this.route('twilioCallForward', {
  path: '/twilio/forward/:clientId/call-id/:callId',
  where: 'server',
  action: function(){
    var clientId = this.params.clientId;
    var callId = this.params.callId;
    var protocol = 'https:';
    var baseUrl = protocol + '//' + this.request.headers.host;

    var twimlResponse = new Twilio.TwimlResponse(); 

    // check to see if the user is currently in a call.  if so, direct this right away to 
    // voicemail for the user.
    var lastCallsForUser = Calls.find({
      $or: [
        { dialed_by: clientId }, 
        { assigned_to: clientId }
      ], 
      forwarded_by: { $ne: clientId }, 
      status: 'active', 
      created_at: {
        $exists: true
      }
    }, {
      sort: {
        'created_at': -1
      }
    }).fetch();

    var forwardToVoicemail = false; 
    
    if(lastCallsForUser.length > 0) {
      var lastCall = lastCallsForUser[0];  // last one
      var callSid = lastCall.external_call_sid;

      if(callSid) {
        var future = new Future(); 

        var user = Meteor.users.findOne(this.params.clientId);
            var twilioCredentials = getPracticeTwilioCredentials(user.practice_id);
          twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

          twilioSubaccount.calls(callSid).get(Meteor.bindEnvironment(function(err, call) {
            if(err) {
              console.log(err, call);
              //future.err(err); return;
              future.return(false);
            }

            if(_.contains(['completed', 'busy', 'no-answer', 'failed'], call.status)) {
              Calls.update(lastCall._id, {
                status: 'completed'
              });  // mark this call as done.

              future.return(false);
            } else { // forward to voicemail!
              future.return(true);
            }
          }, function(err) { console.log('err binding environment', err) }));


        forwardToVoicemail = future.wait();
      }
    }

    // set the end_call to go to voicemail
    var clientVoicemailUrl = baseUrl + '/twilio/voicemail/' + clientId; /*?hippoData=' + encodeURIComponent(JSON.stringify({
      actionId: 'voicemail_' + clientId, 
      endCallId: callId  //TODO: end calls in 1-root.js
    }));*/

    var endCallUrl = baseUrl + '/twilio/end-call/' + callId;

    if(!forwardToVoicemail) { // send straight to user
      Calls.update(callId, {
        $set: {
          assigned_to: clientId, 
          end_call: {
            type: 'redirect_or_wait_for_client', //'redirect_or_redial_client', 
            url: clientVoicemailUrl
          }, 
          forwarded_at: new Date()
        }
      });

      twimlResponse.dial({
        action: endCallUrl, 
        method: 'GET', 
        timeout: '15'
      }, function(responseNode) {
        // for all device types, forward to this clientId
        for(var i = 0; i < PhoneHelpers.deviceTypes.length; i++) {
          var curDeviceType = PhoneHelpers.deviceTypes[i];
          responseNode.client(clientId + '_' + curDeviceType); 
        }
      });
    } else { // send straight to endCallUrl


      twimlResponse.redirect({
        method: 'GET'
      }, clientVoicemailUrl);
    }

//    console.log(twimlResponse.toString());

    //TODO: insert endCall for forwarding to this person's voicemail

    this.response.writeHead(200, {'Content-Type': 'text/xml'});
    this.response.end(twimlResponse.toString());
  }
  });
});

// This will have all of the redirect paths and redirect method
/*Meteor.methods({
	'twilioRedirect': function(data) {
		if(!Meteor.user()) { return null; }

		// for testing
		if(data.origin.indexOf('localhost') > -1) { 
			data.origin = 'http://' + twilioTestHost + ':3000';
		}

        var twilioCredentials = getPracticeTwilioCredentials(Meteor.user().practice_id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

    	var redirectUrl = null;

    	// determine redirectUrl from destinationObj
    	if(data.destination == 'hangup') {

	    	redirectUrl = data.origin + '/twilio/hangup';
	    }

	    console.log('redirecting: ', redirectUrl);

	    if(redirectUrl) { // ensure it's set to something
	    	twilioSubaccount.calls(data.callSid).update({
	    		url: redirectUrl, 
	    		method: 'GET'
	    	}, function(err, call) {
	    		if(err) {
		    		console.log(err, call);
		    	}
	    	});
		}
	}
});

Meteor.Routaer.add('/twilio/hangup', function() {
	var twilioResponse = new Twilio.TwimlResponse(); 
	
	twilioResponse.hangup();

    return [200, {
    	'Content-type': 'text/xml'
    }, twilioResponse.toString()];

}); */