// LTC test ground
var bitcoin = require('bitcoinjs-lib');
var request = require('request');
var litecoin = bitcoin.networks.litecoin;
var config = require('../../config/cashier');

var xpriv = config.xpriv;
var coinomiAddress = "LU9idX9vfud6rPCUsdbXX2Y1DcdYF5sPWn";
var txFee = .001 * 1e8;

var node = bitcoin.HDNode.fromBase58(xpriv, litecoin);


// console.log(node.keyPair.toWIF());


// var account = 1;
// var index = 0;
var bankNode = node.deriveHardened(0).derive(0);
var bank = bankNode.keyPair.getAddress();
console.log("Bank: ", bank);
// console.log("Send Money To: \n", child.getAddress());

// Wait for user to deposit money

var getUnspents = function(address, done) {
	var unspentUrl = "http://ltc.blockr.io/api/v1/address/unspent/";
	unspentUrl += address + '?unconfirmed=1';
	
	request(unspentUrl, function(error, response, body) {
		if (!error && response.statusCode == 200) {
			unspents = JSON.parse(body).data.unspent;
			return done(unspents);
		} else {
			console.log("Error calling blockr.io. Check internet connection");
			return done(null);
		}
	});
}

var waitThenDeposit = function(account, index, done) {
	var child = node.deriveHardened(account).derive(0).derive(index);
	var keyPair = child.keyPair;
	var dots = "";
	
	console.log("Send LTC to: ", child.keyPair.getAddress());
	
	var checkUnspents = setInterval(function() {
		process.stdout.write("                                    \r");
		dots.length < 3 ? dots += "." : dots = "";
		getUnspents(child.keyPair.getAddress(), function(unspents) {
			if(unspents.length > 0) {
				var allConfirmed = true;
				var depositBalance = 0;
				unspents.forEach(function(usTx) {
					if(usTx.confirmations == 0) {
						process.stdout.write("Receiving: " + usTx.amount + dots + " \r");
						allConfirmed = false;
					} else {
						process.stdout.write("Processing: " + usTx.amount + dots + " \r");
						depositBalance += Number(usTx.amount);
						
					}
				});
				if(allConfirmed) {
					console.log("\nThanks for depositing: ", depositBalance);
					clearInterval(checkUnspents);
					depositAll(unspents, keyPair, bank, function(tx) {
						return done(tx);
					});
				}
			} else {
				process.stdout.write("Waiting for deposit" + dots + "\r");
			}
			
		});
	}, 5000);
};

var depositAll = function(unspents, inKeyPair, outAddress, done) {
	
	var tx = new bitcoin.TransactionBuilder(litecoin);
	var amount = 0
	unspents.forEach(function(unspent) {
		tx.addInput(unspent.tx, unspent.n);
		amount += Number(unspent.amount);
	});
	console.log(amount);
	tx.addOutput(outAddress, Math.round(amount * 1e8 - txFee));
	
	unspents.forEach(function(unspent, i) {
		tx.sign(i, inKeyPair);
	});
	
	var txHex = tx.build().toHex();
	
	console.log("Depositing to: ", outAddress);
	request.post(
		'http://ltc.blockr.io/api/v1/tx/push',
		{json: {hex: txHex}},
		function (error, response, body) {
			console.log("");
			console.log(body.status);
			if (done && typeof done === "function")
				return done(body);
		}
	);
};

var emptyBank = function(outAddress, done) {
	var bankKeys = bankNode.keyPair;
	var unspentUrl = "http://ltc.blockr.io/api/v1/address/unspent/";
	unspentUrl += bankKeys.getAddress();
	request(unspentUrl, function(error, response, body) {
		if (!error && response.statusCode == 200) {
			var unspents = JSON.parse(body).data.unspent;
			depositAll(unspents, bankKeys, outAddress, function(txBody) {
				return done(txBody);
			});
		} else {
			console.log("check server internet connection");
			return done(null);
		}
	});
}

var withdrawFromBank = function(amount, outAddress, done) {
	var bankKeys = bankNode.keyPair;
	var availBalance = 0;
	var tx = new bitcoin.TransactionBuilder(litecoin);
	getUnspents(bankKeys.getAddress(), function(unspents) {
		var txCount = 0;
		unspents.forEach(function(unspent) {
			if(unspent.confirmations > 0) {
				availBalance += unspent.amount * 1e8;
				tx.addInput(unspent.tx, unspent.n);
				txCount ++;
			}
		});
		tx.addOutput(outAddress, amount * 1e8 - txFee);
		
		var change = availBalance - amount * 1e8;
		if (change > 0 ) {
			tx.addOutput(bankKeys.getAddress(), change);
		}
		
		unspents.forEach(function(unspent, i) {
			tx.sign(i, bankKeys);
		});
		
		var txHex = tx.build().toHex();
	
		console.log("Depositing to: ", outAddress);
		request.post(
			'http://ltc.blockr.io/api/v1/tx/push',
			{json: {hex: txHex}},
			function (error, response, body) {
				console.log("");
				console.log(body.status);
				if (done && typeof done === "function")
					return done(body);
			}
		);
		
	});
	
};
withdrawFromBank(0.01, coinomiAddress, function(body){console.log(body)});


var waitForever = function(account, index) {
	waitThenDeposit(account, index, function(tx) {
		console.log("monitoring", tx.data);
		monitorTransaction(tx.data, function() {
			waitForever(account, index);
		});
	});
}
//waitForever(123, 123);

var monitorTransaction = function(tx, done) {
	txMonitor = setInterval(function() {
		getTransaction(tx, function(txInfo) {
			if(txInfo.data.confirmations > 0 ) {
				clearInterval(txMonitor)
				console.log("transaciton confirmed");
				return done();
			}
		});
	}, 5000);
}

var getTransaction = function(tx, done) {
	txUrl = 'http://ltc.blockr.io/api/v1/tx/info/';
	txUrl += tx;
	
	request(txUrl, function(error, response, body) {
		if (!error && response.statusCode == 200) {
			return done(JSON.parse(body));
		} else {
			console.log("Check internet connection!");
		}
	});
	
}

var sendToCoinomi = function(txHash, n, amount, keyPair) {
	var tx = new bitcoin.TransactionBuilder(litecoin);
	tx.addInput(txHash, n);
	tx.addOutput(coinomiAddress, Math.round(amount * 1e8 - txFee));
	tx.sign(0, keyPair);
	var txHex = tx.build().toHex();
	
	request.post(
		'http://ltc.blockr.io/api/v1/tx/push',
		{json: {hex: txHex}},
		function (error, response, body) {
			console.log("");
			console.log(body);
				
		}
	);
}


