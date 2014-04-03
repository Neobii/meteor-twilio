var Future = Npm.require("fibers/future");

/**
 * This is called by web/iphone when a call is answered.  This will
 * clear the EndCall for this particular call, so it can be set up to
 * do something else, or nothing if the issue is resolved
 * during the call.
 * @returns the call id -- got for iPhone, as call id is not passed.
 */
Meteor.methods({
    'clearEndCall': function(callSid) {
        var user = Meteor.users.findOne(Meteor.userId());
        if(!user) { return; } 

        var practice = Practices.findOne(user.practice_id);

        twilioCredentials = getPracticeTwilioCredentials(user.practice_id);

        var twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

        // find parent call sid, and clear endCall for it's corresponding Call
        twilioSubaccount.calls(callSid).get(Meteor.bindEnvironment(function(err, call) {
            var parentCallSid = call.parent_call_sid; 

            var call = Calls.findOne({
                'external_call_sid': parentCallSid
            });

            if(call) {
                Calls.update(call._id, {
                    $unset: {
                        end_call: ''
                    }
                });

            }
        }, function(err) {
            console.log("can't bind: ", err);
        }));
    }
});
/*
function clearEndCallForAll(callSid, twilioSubaccount) {

    var call = Calls.findOne({
        'call_sid': callSid
    });

    if(call && call.endCall) {
        Calls.remove(call._id);
    }

    // find parent callSids, and clearEndCallForAll them.
    twilioSubaccount.calls(callSid).get(Meteor.bindEnvironment(function(err, call) {
        var parentCallSid = call.parent_call_sid; 

        if(parentCallSid) {
            clearEndCallForAll(parentCallSid, twilioSubaccount);
        }
    }, function(err) {
        console.log("can't bind: ", err);
    }));
}*/

Router.map(function () {
  this.route('twilioEndCall', {
  path: '/twilio/end-call/:callId',
  where: 'server',
  action: function(){
    var callId = this.params.callId;
    var protocol = 'https:';
    var baseUrl = protocol + '//' + this.request.headers.host;

	var twilioResponse = new Twilio.TwimlResponse(); 

    var request = this.request;
    
    var query = request.query;

    var call = Calls.findOne(callId);    
    if(call){// just incase someone tries to call this route wihtout a call being defined
        var endCall = call.end_call ? call.end_call : {type:null};

        // we change the status back to active -- in this case, ignoring the current
        // 'end call' (such as when the operator forwards a call to a doctor), becoming 
        // 'open' for the next 'end call'.
        var changeStatusToActive = _.contains(['forwarding'], call.status);
        var hasValidEndCall = _.contains(['redirect_or_wait_for_client','redirect','dial'], endCall.type);
        
        if(!changeStatusToActive) {
            if(hasValidEndCall) {
                //note: 'type' is in terms of Twilio's API -- redirect means redirect URL, dial means dial.
            	switch(endCall.type) {
                    case 'redirect_or_wait_for_client': //'redirect_or_redial_client':  // if the forwarded_at time is < 15 seconds, try again. 
                        var nowTime = new Date().getTime(); 
                        var forwardedAtTime = call.forwarded_at.getTime(); 

                        var timeDiffInSeconds = (nowTime - forwardedAtTime) / 1000;  
                        console.log('Time diff: ', timeDiffInSeconds);
                        console.log(query.DialCallStatus);

                        if(timeDiffInSeconds < 30 && query.DialCallStatus != 'busy') { //} && (query.DialCallStatus != 'completed' && query.DialCallStatus != 'no-answer')) {  // query.DialCallStatus shows up as 'busy' when i hit decline.  more possibilities at: https://www.twilio.com/docs/api/twiml/dial
                            // put the caller on "forward-hold" 
                            twilioResponse.dial({
                                action: baseUrl + '/twilio/forward-hold', 
                                method: 'GET'
                            });
                        } else {

                            twilioResponse.redirect({
                                method: 'GET'
                            }, endCall.url);
                        
                        }

                        break;
            		case 'redirect':
                        console.log('End Call Url: ', endCall.url);

            			twilioResponse.redirect({
            				method: 'GET'
            			}, endCall.url);
            			break;
                    case 'dial':
                        twilioResponse.dial(function(responseNode) {
                            responseNode.client(endCall.client);
                        });
                        break;
            	}
            }

            // if it does not have a valid end-call, OR if we're redirecting (probably to voicemail), AND 
            // it's an outbound call (which means the status_callback for the # WON'T be called), 
            // let's mark it as completed.
            if(!hasValidEndCall || (endCall.type == 'redirect' && query.CallStatus.indexOf('outbound') > -1)) {

                Calls.update(call._id, {
                    $set: {
                        'status': 'completed'
                    }
                });

                twilioResponse.hangup();  // just hangup
            }
        } else {
            Calls.update(call._id, {
                $set: {
                    'status': 'active'
                }
            });
        }

    ///    console.log(twilioResponse.toString());
    /*    if(query.CallStatus != 'in-progress') {
            Calls.update(call._id, {
                $set: {
                    'status': 'completed'
                }
            });
        }*/
    }
    this.response.writeHead(200, {'Content-Type': 'text/xml'});
    this.response.end(twilioResponse.toString());
  }
});
});
Router.map(function () {
  this.route('twilioForwardRing', {
  path: '/twilio/forward-ring/:callId',
  where: 'server',
  action: function(){
    var callId = this.params.callId;
    var protocol = 'https:';
    var baseUrl = protocol + '//' + this.request.headers.host;

    var twilioResponse = new Twilio.TwimlResponse(); 

    var request = this.request;
    
    var query = request.query;
 
    var call = Calls.findOne(callId);    
    if(call){
        var clientId = call.assigned_to; 

        twilioResponse
                    .say({
                        voice: 'alice', 
                        language: 'en-GB'
                    }, 'Please wait while we connect your call...')
                    .pause({length:4})
                    .dial({
                            action: baseUrl + '/twilio/end-call/' + call._id, 
                            method: 'GET', 
                            timeout: '15'
                        }, function(responseNode) {
                            // for all device types, forward to this clientId
                            for(var i = 0; i < PhoneHelpers.deviceTypes.length; i++) {
                                var curDeviceType = PhoneHelpers.deviceTypes[i];
                                responseNode.client(clientId + '_' + curDeviceType); 
                            }
                        });
        this.response.writeHead(200, {'Content-Type': 'text/xml'});
        this.response.end(twilioResponse.toString());
      }
      this.response.writeHead(404);
    }  
  });
});