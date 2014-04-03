/**
 * Twilio will call this when someone calls one of our numbers to begin.
 */
  Router.map(function () {
  this.route('twilioRoot', {
  path: '/twilio',
  where: 'server',
  action: function(){

	  var twilioRootObj = twilioRoot(this.request);
    this.response.writeHead(twilioRootObj[0], twilioRootObj[1]);
    this.response.end(twilioRootObj[2]);
  }
  }); 
});

/**
 * This will route specifically to the voicemail of the _id specified. 
 * It does this by appending hippoData and passing it to twilioRoot. 
 * This will be called from end-call, and is the result of a forward 
 * not answered. 
 */
  Router.map(function () {
  this.route('twilioVoicemail', {
  path: '/twilio/voicemail/:id',
  where: 'server',
  action: function(){
    var userId = this.params.id;
	  var hippoData= {
		  actionId: 'voicemail_' + userId
	  }

	this.request.query.hippoData = JSON.stringify(hippoData); 
  var twilioRootObj = twilioRoot(this.request);
  this.response.writeHead(twilioRootObj[0], twilioRootObj[1]);
  this.response.end(twilioRootObj[2]);
	}
  });
});

/**
 * This is defined in a separate function so we can do quicker
 * testing.
 */
twilioRoot = function(request) {
	// this is the twilio response object that will generate the TwiML
	var twilioResponse = new Twilio.TwimlResponse(); 

	// Twilio makes the initial call to this url with GET to get TwiML
	// we ignore the next call, POST, with the RecordingURL, as we will wait
	// for /twilio/transcribe to be called
	var query = request.query;
	var callInfo = ServerPhoneHelpers.processRequest(request);
	var hippoData = callInfo.hippoData;
	var practice = callInfo.practice;

    if(request.method == 'GET' && query.CallStatus != 'completed') {
		
		var actions = ServerPhoneHelpers.getUserVoicemailActions(query,null);
		var curAction = ServerPhoneHelpers.getUserVoicemailActionById(actions, hippoData.actionId);

		var isBusinessHours = false;
		var skipDialingClient = false;  // this will be true if they've already attempted to call the client once

		if(hippoData.actionId == 'businessHours') {
			isBusinessHours = true;
		}

		if(hippoData.skipDialingClient) {
			skipDialingClient = true;
		}

		switch(hippoData.actionId) {
			case 'softholdVerify1':
				if(callInfo.numberBlocked) {  // I think this spells anonymous
					hippoData.previousRoute = hippoData.actionId; 
					hippoData.actionId = 'enterPhone';  // ensure they enter #
				}
				break;
			case 'softholdCompletion':  
			    // insert call to put 'em on hold
				var c = Calls.insert({
					type: 'incoming', 
					status: 'softhold', 
					external_call_sid: query.CallSid, 
					phone_number: callInfo.fromNum, 
					user: callInfo.fromUserId, 
					practice_id: practice._id, 
					hold_at: new Date(), 
					created_at: new Date()
				});
				break;
			default:
				if(curAction.after && curAction.after.type == Enums.PostRouteActions.RecordMessage) {
					
					if(callInfo.numberBlocked) {
						hippoData.previousRoute = hippoData.actionId; 
						hippoData.actionId = 'enterPhone';
					}
				}
				break;
		}
	}
	var baseUrl = 'https://' + request.headers.host;

	var sayPlayGatherUrl = baseUrl + '/twilio/say-play-gather/';
	sayPlayGatherUrl = ServerPhoneHelpers.attachHippoDataToUrl(hippoData, sayPlayGatherUrl);

	if(isBusinessHours && !skipDialingClient) { // dial practice first
		
		

		var practiceUsersOnline = Presences.find({
			state: {
				online: true, 
				practice_id: practice._id
			}
		}).fetch();

		var currentCallId = Calls.insert({
			type: 'incoming', 
			status: 'active', 
			external_call_sid: query.CallSid, 
			end_call: {
				type: 'redirect', 
				url: sayPlayGatherUrl 
			}, 
			phone_number: callInfo.fromNum, 
			phone_number_user_id: callInfo.fromUserId, 
			practice_id: practice._id, 
			created_at: new Date()
		});
		
		var endCallUrl = baseUrl + '/twilio/end-call/' + currentCallId;

		twilioResponse.dial({
		    action: endCallUrl, 
		    method: 'GET', 
			timeout: '5'
		}, function(responseNode) {
			for(var i = 0; i < practiceUsersOnline.length; i++) {  // send to all practice users (web)
				var clientId = practiceUsersOnline[i].userId + '_web';

				responseNode.client({
					method: 'GET'
				}, clientId );  // call the practice
			}
		});

	} else {
    	// voicemail
    	twilioResponse.redirect({
    		method: 'GET'
    	}, sayPlayGatherUrl);
	}

	return [200, {
		'Content-type': 'text/xml'
	}, twilioResponse.toString()];
}


/**
 * This will add a message to a conversation (or create a new conversation) 
 * for an incoming call.  The query data is passed in.
 * @param query
 */
function logIncomingCall(query) {
    var user = Meteor.users.findOne(query.MeteorUserId);
    var dialType = query.DialType;

    if(dialType == Enums.DialType.Client) {  // could be member or contact

        /*
                var sender = Helpers.findUserByPhone(fromNum);

        var contact = {
            type: Enums.CommunicationType.Phone,
            value: fromNum,
            id: sender ? sender._id : null
        }

        var message = {
            type: Enums.CommunicationType.Phone,
            body: 'Transcribed text: ' + body.TranscriptionText,
            practice_id: practice._id,
            from: contact,
            audio: data.filename
        }    

        var conversation = {
            practice_id: practice._id,
            members: ['0'],
            contacts: [contact]
        }*/

        var sendToUser = Meteor.users.findOne(query.To);
        var conversation = {};

        var message = {
            type: Enums.CommunicationType.Phone, 
            body: 'Called at ' + moment(new Date()).format('h:mma on M/D/YYYY'), 
            practice_id: user.practice_id, 
            from: {
                id: user._id
            }
        }

        if(sendToUser.practice_id) { // member!
           conversation = {
                practice_id: user.practice_id, 
                members: [sendToUser._id, user._id], 
                contacts: []
            }
        } else { // contact!
           conversation = {
                practice_id: user.practice_id, 
                members: [user._id], 
                contacts: [{id:sendToUser._id}]
            }
        }

        ConversationMethods.createConversation(message, conversation);
    } else if(dialType == Enums.DialType.Number) {

        var toUser = Helpers.findUserByPhone(query.To);

        var members = [user._id];
        var contacts = [];

        if(toUser) {
            if(toUser.practice_id) { 
                members.push(toUser._id);
            } else {
                contacts = [{id:toUser._id}];
            }
        } else { // contact, but not id
            contacts = [{
                type: Enums.CommunicationType.Phone, 
                value: query.To, 
                id: null
            }];
        }

        var message = {
            type: Enums.CommunicationType.Phone, 
            body: 'Called at ' + moment(new Date()).format('h:mma on M/D/YYYY'), 
            practice_id: user.practice_id, 
            from: {
                id: user._id
            }
        }
        var conversation = {
            practice_id: user.practice_id, 
            members: members, 
            contacts: contacts
        }
        ConversationMethods.createConversation(message, conversation);
    }
}