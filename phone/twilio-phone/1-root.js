// TEST
/*var twilioResponse = new Twilio.TwimlResponse(); 

twilioResponse.dial({callerId:'+15302222222'}, '+15302191209');
console.log(twilioResponse.toString());*/
Router.map(function () {
  this.route('twilioPhone', {
  path: '/twilio/phone',
  where: 'server',
  action: function(){

    console.log('TWIML Request: ' + JSON.stringify(query));

    var twilioResponse = new Twilio.TwimlResponse(); 
    
    var request = this.request;
    var query = this.params;

    var protocol = 'https:';
    var baseUrl = protocol + '//' + request.headers.host;

    var endCallUrl = baseUrl + '/twilio/end-call/' + query.CurrentCallId;
    var dialType = parseInt(query.DialType);

    if(request.method === 'GET' && query.CallStatus != 'completed') {


        //TODO: make sure query.To is a decent number, if DialType.Number    
        twilioResponse.dial({
            action: endCallUrl, 
            method: 'GET', 
            callerId: query.From
        }, function(responseNode) {

            if(dialType == Enums.DialType.Number) {
                responseNode.number({
                    url: baseUrl + '/twilio/phone/outgoing-call-status/' + query.CurrentCallId, 
                    method: 'GET'
                }, query.To);
            } else if(dialType == Enums.DialType.Queue) {
                responseNode.queue(query.To);
            } else if(dialType == Enums.DialType.Client) { 
                // ensure external_call_id is present, as this is the parent_call_sid
                Calls.update(query.CurrentCallId, {
                    $set: {
                        external_call_sid: query.CallSid
                    }
                });

                // for all device types, forward to this clientId
                for(var i = 0; i < PhoneHelpers.deviceTypes.length; i++) {
                    var curDeviceType = PhoneHelpers.deviceTypes[i];
                    responseNode.client({
                        url: baseUrl + '/twilio/phone/outgoing-call-status/' + query.CurrentCallId, 
                        method: 'GET'
                    }, query.To + '_' + curDeviceType); 
                }
            }
        });

        // make sure to log this in messages for conversations.
        logOutgoingCall(query);
    }

    this.response.writeHead(200, {'Content-Type': 'text/xml'});
    this.response.end(twilioResponse.toString());
  }
  });
});

/**
 * This will add a message to a conversation (or create a new conversation) 
 * for an outgoing call.  The query data is passed in.
 * @param query
 */
function logOutgoingCall(query) {
    var user = Meteor.users.findOne(query.MeteorUserId);

    if(!user) { return; }

    var dialType = query.DialType;

    if(dialType == Enums.DialType.Client) {  // could be member or contact

        var sendToUser = Meteor.users.findOne(query.To);
        var conversation = {};

        var message = {
            type: Enums.CommunicationType.Phone, 
            body: 'Called at ' + moment(new Date()).format('h:mma on M/D/YYYY'), 
            practice_id: user.practice_id, 
            from: user._id, 
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
                contacts: [sendToUser]
            }
        }
        console.log('dialing client')
        ConversationMethods.createConversation(message, conversation);
    } else if(dialType == Enums.DialType.Number) {

        var toUser = Helpers.findUserByPhone(query.To);

        var members = [user._id];
        var contacts = [];

        if(toUser) {
            if(toUser.practice_id) { 
                members.push(toUser._id);
            } else {
                contacts = [toUser._id];
            }
        } else { // contact, but not id
            contacts = [query.To];
        }

        var message = {
            type: Enums.CommunicationType.Phone, 
            body: 'Called at ' + moment(new Date()).format('h:mma on M/D/YYYY'), 
            practice_id: user.practice_id, 
            from: user._id
        }
        var conversation = {
            practice_id: user.practice_id, 
            members: members, 
            contacts: contacts
        }
        console.log('dialing number')
        ConversationMethods.createConversation(message, conversation);
    }
}