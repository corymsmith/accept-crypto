var cash = require('./cashier.js');
console.log("Bank: ", cash.bankNode.keyPair.getAddress());

var testWallet = 'LaNxYqYrR6KT2EzFFkDAeEv423PwDPkTw1';
var test2 = 'Laxri1DFx8BDBCek2Eh3Zmnzi7PoWfd77C'; // Bank address
//working
// cash.getUnspents(testWallet, function(unspents) {
// 	console.log(unspents.length);
// })

//working
//cash.waitThenDeposit(1, 0, function(tx) { console.log(tx) });
var coinomiAddress = "LU9idX9vfud6rPCUsdbXX2Y1DcdYF5sPWn";

//working
cash.withdrawFromBank(0.51, coinomiAddress, function(body){console.log(body)});