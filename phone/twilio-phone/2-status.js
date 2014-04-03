/*//TODO: figure out if we care about non-parent-sid's, and how we should handle them.
//Remember: we can rely on Twilio for actual records.  This is mainly for holds / forwards / etc. 
Meteor.Routder.add('/twilio/phone/incoming-call-status', function() {

    var twilioResponse = new Twilio.TwimlResponse(); 

    var query = this.request.query;

    var call = Calls.findOne({
        external_call_sid: query.ParentCallSid
    });

    Calls.update(call._id, {
        $set: {
            answered: true
        }
    });

    return [200, {
        'Content-type': 'text/xml'
    }, twilioResponse.toString()];

});*/

Router.map(function () {
  this.route('twilioPhoneOutgoingStatus', {
  path: '/twilio/phone/outgoing-call-status/:callId',
  where: 'server',
  action: function(){
    var callId = this.params.callId;
    var twilioResponse = new Twilio.TwimlResponse(); 

    var query = this.params;

    Calls.update(callId, {
        $set: {
            answered: true, 
            external_call_sid: query.CallSid, 
            phone_number: query.To
        }
    });

    console.log('Updated ', callId);

    this.response.writeHead(200, {'Content-Type': 'text/xml'});
    this.response.end(twilioResponse.toString());
  }
  });
});