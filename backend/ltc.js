var cash = require('./cashier.js');
var User = require('../models/user');
var Account = require('../models/account');

ltc = {};
ltc.getAddress = function(req, res, done) {
	var userId = req.user._id;
	var address = "";
	
	// Check if user has an account set up. If not, do so now

	Account.findOne({userId: userId}, function(err, account) {
		if (err){
			console.log(err);
			return done(err);
		}

		if (account) {
			// check if user has a litecoin address
			if (account.ltcAddresses.length > 0){
				// User already has an address
				req.user.ltcAddresses = account.ltcAddresses;
				return done(account.ltcAddresses[account.ltcAddresses.length -1]);
			} else {
				address = cash.getAddress(user.accountId, 0);
				account.ltcAddresses = [address];
				req.user.ltcAddresses = account.ltcAddresses;
				account.save(function(err) {
					if(err) {return done(err);}

					return done(account.ltcAddresses[account.ltcAddresses.length -1]);
				});	
			}
		} else {
			// User does not have an account. Create one
			var newAccount = new Account();
			User.findById(userId, function(err, user) {
				if (err){
					console.log(err);
					return done(err);
				}
				
				// check if the user alread has an address
				if (!user.ltcAddresses || user.ltcAddresses.length == 0) {
					address = cash.getAddress(user.accountId, 0);
					user.ltcAddresses = [address];
				} else {
					address = user.ltcAddresses[user.ltcAddresses.length -1];
				}

				newAccount.ltcAddresses = user.ltcAddresses;
				newAccount.username = user.local.username;
				newAccount.userId = user._id;
				
				req.user.ltcAddresses = newAccount.ltcAddresses;
				user.save(function(err) {
					if(err) return done(err);
					
					newAccount.save(function(err) {
						if(err) return done(err);
						
						console.log("created address: ", address);
						return done(address);
					})
				});
			});	

		}
	});

}


ltc.checkDepositStatus = function(req, res, done) {
	var account = req.user.accountId;
	var index = req.user.ltcAddresses.length -1;
	
	cash.checkDepositStatus(account, index, function(msg) {
		console.log(msg);
		if(msg.amount) {
			//update balance
			
			User.findById(req.user._id, function(err, user) {
				if(err) return done("error finding user");
				
				if(user.depositTxs.indexOf(msg.data) < 0) {
					user.balance = user.balance + msg.amount;
					user.balance = Math.round(user.balance * 1e8) * 1e-8;
					msg.balance = user.balance;
					console.log(msg.tx.hash)
					user.depositTxs.push(msg.tx.hash);
					
					
					user.save(function(err) {
						if(err) return done(err);
						
						console.log("Deposited", msg.amount);

						Account.findOne({userId: req.user._id}, function(err, account) {
							if(err) return done(err);

							account.deposits.push({tx: msg.tx.hash, amount: msg.amount});
							account.save(function(err){
								if(err) return done(err);
								
								return done(msg);

							});
						});
					});
				} else {
					return done({message: "Already Deposited that"});
				}
			});
		} else {
			//console.log(msg);
			done(msg);
		}
	});
}

ltc.withdraw = function(req, res, done) {
	if (req.body.amount > req.user.balance) {
		req.flash("cashierMessage", "Invalid amount requested");
		done();
	} if (!cash.validAddress(req.body.address)) {
		req.flash("cashierMessage", "Invalid  withdraw address");
		done();
	} else {
		var amount = req.body.amount;
		amount = Math.round(amount * 1e8) * 1e-8; 
		var address = req.body.address;

		cash.withdrawFromBank(amount , address, function(msg) {
			console.log(msg);
			if (msg.tx != undefined) {
				msg.amount = amount;
				msg.address = address;
				User.findById(req.user._id, function(err, user) {
					if(err) return done("error finding user");

					user.balance = Math.round((user.balance - amount) * 1e8) * 1e-8;
					user.save(function(err){
						if(err) return done(err);

						req.user.balance = user.balance;

						Account.findOne({userId: req.user._id}, function(err, account){
							account.withdrawals.push({tx: msg.tx.hash, amount: msg.amount});

							account.save(function(err){
								if(err) return done(err);

								console.log("Success");
								return done(msg);
							});
						})
					});
				});
			} else {
				console.log("msg");
				console.log("Failure Detected")
				req.flash("cashierMessage", "The bank is busy right now. Try again in a few minutes");
				return done(msg);
			}
		});
	}
}




module.exports = ltc;