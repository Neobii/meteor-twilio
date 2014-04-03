
var PhoneMethodsClass = function(){}

PhoneMethodsClass.prototype.sendPhoneMessage = function(userId, message)
{
	var toUser = Meteor.users.findOne(userId);
	var phoneNumber;
	var practice;

	var practice = Practices.findOne(message.practice_id);
	if(!practice || !practice.voicemail_number) { return; }

	var contact = Meteor.users.findOne(userId); 

    var textToSend = "You have a new message waiting for you at: "+Helpers.hostUrl()+"messages/view/"+message.conversation_id;
    if (toUser.profile.registration_state != Enums.RegistrationState.Registered) 
    	textToSend = "Hi there! You have a message from " + practice.name + ", please click here to register and view it: " + Helpers.hostUrl()+"r/"+userId;
    if (message.insensitive) 
    	textToSend = message.body;
    
	if(contact && contact.profile && contact.profile.phones && contact.profile.phones.length > 0) {
		var phoneNumber = contact.profile.phones[0].number;
		if (!Helpers.isNANP(phoneNumber))
		{
			console.log("Phone number is invalid:" + phoneNumber)
			return;
		}

        var twilioCredentials = getPracticeTwilioCredentials(practice._id);
    	twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

		twilioSubaccount.sendSms({
			to: phoneNumber, 
			from: practice.voicemail_number, 
			body: textToSend
		}, function(err, message) {
			if(err) { console.log(err, message); }
		});
	}
}

PhoneMethods = new PhoneMethodsClass();

Meteor.methods({
	'sendPhoneMessage': function(userId, message) {
		if (ConversationMethods.checkUserPermissionsForConversation(message.conversation_id))
			return PhoneMethods.sendPhoneMessage(userId, message);
	}
});