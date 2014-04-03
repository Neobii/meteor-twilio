SmsMessages = {
	Name: 'Thank you.  To help us assist you, please reply with your name.', 
	Email: 'Thank you.  Last thing -- please reply with your email address.', 
}

SmsActions = {
	Name: 1, 
	Email: 2
}

Router.map(function () {
  this.route('twilioText', {
  path: '/twilio/sms',
  where: 'server',
  action: function(){

	// this is the twilio response object that will generate the TwiML
	var twilioResponse = new Twilio.TwimlResponse(); 

	var query = this.request.query; 

	var toNum = query.To;
	var fromNum = query.From; 

	if(fromNum == '+266696687') {
		twilioResponse.sms('Please call from a number that is not blocked');
		return;
	}

	toNum = PhoneHelpers.removeCountryCode(toNum);
	fromNum = PhoneHelpers.removeCountryCode(fromNum);

	// find with practice this number belongs to
	var practice = Practices.findOne({
		'voicemail_number': toNum
	});

	if(!practice) {  // no practice is lined up with this number yet... 
		twilioResponse.sms('We are experiencing technical difficulties.  Please try again later.');
		return [200, {'Content-type': 'text/xml'}, twilioResponse.toString()];
	}

	// create conversation
    var sender = Helpers.findUserByPhone(fromNum);

    var message = {
        type: Enums.CommunicationType.Text, 
        insensitive: false, 
        body: query.Body,
        practice_id: practice._id,
        from: fromNum
    }    
 
    var conversation = {
        practice_id: practice._id,
        _users: ['0', fromNum]
    }
 
    var conversationData = ConversationMethods.createConversation(message,conversation);

    if(conversationData.isNew) {
    	twilioResponse.sms('Thank you for contacting ' + practice.name + '.  We will get back to you as soon as possible.');
    }

	
    this.response.writeHead(200, {'Content-Type': 'text/xml'});
    this.response.end(twilioResponse.toString());
  }
  });
});

