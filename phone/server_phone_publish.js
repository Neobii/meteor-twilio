Meteor.publish('myPhoneVerified', function(phone) {
	var self = this; 

    self.observeHandle = Meteor.users.find({
   		'profile.phones.number': phone, 
   		'profile.phone_verified': true
	}).observe({
		added: function(doc) {

			self.added('phoneVerified', doc._id, {
				phone: phone
			});
 			
 			// sometimes 'stop' would get called after it's already stopped...  so make sure it exists
			if(self.observeHandle) {
				self.observeHandle.stop();
			}
		}
	});
});  

Meteor.publish("phoneCalls", function() {
	if(this.userId) {
		return PhoneCalls.find({
			userId: this.userId
		});
	}
	return null;
});