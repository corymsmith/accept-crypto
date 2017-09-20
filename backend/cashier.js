// LTC test ground
var bitcoin = require('bitcoinjs-lib');
var request = require('request');
var bigInt = require('big-integer');
var config = require('../config/wallet-info');

var network = bitcoin.networks.litecoin;

var xpriv = config.xpriv;

// Test output wallet address
var coinomiAddress = "LU9idX9vfud6rPCUsdbXX2Y1DcdYF5sPWn";

var node = bitcoin.HDNode.fromBase58(xpriv, network);

cash = {
	self: this,
	network: bitcoin.networks.litecoin,
	xpriv: config.xpriv,
	txFee: (0.001 * 1e8),
	timeout: 10000
}
cash.node = bitcoin.HDNode.fromBase58(cash.xpriv, cash.network);
cash.bankNode = node.deriveHardened(0).derive(0);



cash.getUnspents = function(address, done) {
	var unspentUrl = "https://api.blockcypher.com/v1/ltc/main/addrs/";
	unspentUrl += address + '?unspentOnly=true';
	
	request(unspentUrl, function(error, response, body) {
		if (!error && response.statusCode == 200) {
			unspents = JSON.parse(body).txrefs;
			if (unspents == undefined){
				unspents = [];
			}
			return done(unspents);
		} else {
			console.log("Error calling blockr.io. Check internet connection");
			setTimeout(function(){ return done([]);}, cash.timeout);
		}
	});
}

cash.getAddress = function(account, index) {
	var address = cash.node.deriveHardened(account).derive(0).derive(index);
	return address.getAddress();
}

cash.validAddress = function(address) {
	try {
		bitcoin.address.toOutputScript(address, network);
	}

	catch(err){
		console.log(err);
		return false;
	}
	return true;
}

cash.waitThenDeposit = function(account, index, done) {
	var child = cash.node.deriveHardened(account).derive(0).derive(index);
	var keyPair = child.keyPair;
	
	console.log("Send LTC to: ", child.keyPair.getAddress());
	
	var checkUnspents = setInterval(function() {
		cash.getUnspents(child.keyPair.getAddress(), function(unspents) {
			if(unspents.length > 0) {
				var allConfirmed = true;
				var depositBalance = 0;
				unspents.forEach(function(usTx) {
					if(usTx.confirmations == 0) {
						process.stdout.write("Receiving: " + usTx.value + " \r");
						allConfirmed = false;
					} else {
						process.stdout.write("Processing: " + usTx.value + " \r");
						depositBalance += Number(usTx.value);
					}
				});
				if(allConfirmed) {
					console.log("\nThanks for depositing: ", depositBalance);
					clearInterval(checkUnspents);
					cash.depositAll(unspents, keyPair, cash.bankNode.keyPair.getAddress(), function(tx) {
						return done(tx);
					});
				}
			} else {
				process.stdout.write("Waiting for deposit" + "\r");
			}
			
		});
	}, cash.timeout);
};

cash.checkDepositStatus = function(account, index, done) {
	var child = cash.node.deriveHardened(account).derive(0).derive(index);
	var keyPair = child.keyPair;
	cash.getUnspents(child.keyPair.getAddress(), function(unspents) {
		if(unspents.length > 0) {
			var allConfirmed = true;
			var depositBalance = 0;
			unspents.forEach(function(usTx) {
				if(usTx.confirmations == 0) {
					allConfirmed = false;
					return done({receiving: "Receiving: " + usTx.value});
				} else {
					depositBalance += Number(usTx.value);
				}
			});
			if(allConfirmed) {
				console.log("\nThanks for depositing: ", depositBalance);
				cash.depositAll(unspents, keyPair, cash.bankNode.keyPair.getAddress(), function(tx) {
					tx.amount = depositBalance * 1e-8;
					return done(tx);
				});
			}
		} else {
			return done("Waiting for deposit");
		}
	});
}

cash.depositAll = function(unspents, inKeyPair, outAddress, done) {
	
	var tx = new bitcoin.TransactionBuilder(cash.network);
	var amount = 0
	unspents.forEach(function(unspent) {
		tx.addInput(unspent.tx_hash, unspent.tx_output_n);
		amount += Number(unspent.value);
	});
	tx.addOutput(outAddress, Math.round(amount - cash.txFee));
	unspents.forEach(function(unspent, i) {
		tx.sign(i, inKeyPair);
	});
	
	var txHex = tx.build().toHex();
	
	console.log("Depositing to: ", outAddress);
	request.post(
		'https://api.blockcypher.com/v1/ltc/main/txs/push',
		{json: {tx: txHex}},
		function (error, response, body) {
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

cash.withdrawFromBank = function(amount, outAddress, done) {
	// Currently broken - do not use
	var bankKeys = cash.bankNode.keyPair;
	var availBalance = 0;
	var tx = new bitcoin.TransactionBuilder(cash.network);
	cash.getUnspents(cash.bankNode.getAddress(), function(unspents) {
		var txCount = 0;
		unspents.forEach(function(unspent) {
			if(unspent.confirmations > 0) {
				if(availBalance < (amount * 1e8)) {
					availBalance += parseInt(Number(unspent.value));
					tx.addInput(unspent.tx_hash, unspent.tx_output_n);
					txCount ++;
				}
			}
		});
		if (txCount == 0) { 
			return done({error: "Bank busy right now" });
		}
		console.log("Bank: ", availBalance);
		console.log("Ask:  ", parseInt(amount * 1e8 - cash.txFee));
		console.log("Using ", txCount, "unspents");
		tx.addOutput(outAddress, parseInt(amount * 1e8 - cash.txFee));
		var change = parseInt(availBalance - amount * 1e8);
		if (change > 0 ) {
			tx.addOutput(bankKeys.getAddress(), change);
		}
		
		for (var i = 0; i < txCount; i++) {
			tx.sign(i, bankKeys);
		}
		
		var txHex = tx.build().toHex();
	
		console.log("Depositing to: ", outAddress);
		request.post(
			'https://api.blockcypher.com/v1/ltc/main/txs/push',
			{json: {tx: txHex}},
			function (error, response, body) {
				if (done && typeof done === "function")
					body.amount = amount;
					body.address = outAddress;
					return done(body);
			}
		);
		
	});
	
};
//withdrawFromBank(0.01, coinomiAddress, function(body){console.log(body)});


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
	// Currently broken - update to blockcypher
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
	// Currently broken - update to blockcypher
	var tx = new bitcoin.TransactionBuilder(network);
	tx.addInput(txHash, n);
	tx.addOutput(coinomiAddress, Math.round(amount * 1e8 - cash.txFee));
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

module.exports = cash;


