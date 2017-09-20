var refreshInterval = 30000;
var ltcAddress = "";
var exchangeRate = 0;
$.getJSON('/address', function(msg) {
	console.log(msg.address);
	var qrcode = new QRCode(document.getElementById("qrcode"), {
		width: 200,
		height: 200
	});
	qrcode.makeCode(msg.address);
	ltcAddress = msg.address;
	var addressText = [msg.address.slice(0, 17), msg.address.slice(17)]
	if ($('#qr-contain') != null) {
		$('#qrcode').append('<a href="https://live.blockcypher.com/ltc/address/' +
					msg.address + 
					'" target="_blank">' + addressText[0] + '<br/>' + addressText[1] + '</a>');
		attatchClipboard(ltcAddress);
	}
	checkClientSide(ltcAddress, function(res){console.log(res);});
});

var attatchClipboard = function(address){
	if ($('#copyButton') != null){
		$('#copyButton').click(function(){
			var $temp = $('<input>');
			$('body').append($temp);
			$temp.val(address).select();
			document.execCommand("copy");
			$temp.remove();
		})
	}
}

$('#qr-contain').click(function() {
	$('#qr-contain').hide();
});

$('#qr-open').click(function() {
	$('#qr-contain').show();
});

var checkClientSide = function(address) {
	var url = "https://api.blockcypher.com/v1/ltc/main/addrs/"
	url += address + "?unspentOnly=true";
	$.getJSON(url, function(res){
		if(res.address && res.address == address) {
			if(res.txrefs == undefined && res.unconfirmed_txrefs == undefined){
				// No unspents, keep checking
				console.log("waiting for deposit...");
				setTimeout(function() {
					return checkClientSide(address);
				}, refreshInterval);
			} else {
				var unconfirmed = false;
				var amount = 0;
				var unconfirmedAmount = 0;
				if(res.unconfirmed_txrefs){
					res.unconfirmed_txrefs.forEach(function(unspent){
						unconfirmedAmount += Number(unspent.value);
					})
					console.log("Receiving " + unconfirmedAmount * 1e-8);
					$('#receiving').text("Receiving " + (unconfirmedAmount * 1e-8).toFixed(8));
					$('#receiving').show();
					setTimeout(function() {
						return checkClientSide(address);
					}, refreshInterval);
				} else if(res.txrefs) {
					res.txrefs.forEach(function(unspent){
						if (unspent.confirmations == 0) {
							unconfirmed = true;
							amount += Number(unspent.value);
						}
						console.log("Processing")
						setTimeout(function() {
							return checkStatus();
						}, 500);
					});
				}
			}

		} else {
			// Problem loading blockr, wait then try again
			setTimeout(function() {
				return checkClientSide(address);
			}, refreshInterval);
		}
	}).fail(function() {
		console.log("network error");
		setTimeout(function() {
			return checkClientSide(address);
		}, refreshInterval);
	});
}

//Continually check for deposits
var checkStatus = function() {
	$.getJSON('/deposit', function(msg) {
		console.log(msg);
		if (msg.balance) {
			//$('#balance').text(msg.balance);
			$('#receiving').hide();
			setBalance(msg.balance);
			setTimeout(function() {
				// Wait longer after successful deposit
				
				checkClientSide(ltcAddress);
			}, refreshInterval * 5)
		} if (msg.receiving) {
			// unconfirmed transaction
			$('#receiving').text(msg.receiving);
			$('#receiving').show();
			setTimeout(function() {
				checkStatus();
			}, refreshInterval)

		}if (msg.message) {
			// Probably already deposited so wait longer
			$('#receiving').hide();
			setTimeout(function() {
				// Wait longer after successful deposit
				checkClientSide(ltcAddress);
			}, refreshInterval * 5)
		
		} else {
			$('#receiving').hide();
			setTimeout(function() {
				checkClientSide(ltcAddress);
			}, refreshInterval)
		}
	});
}

var setBalance = function(balance) {
	var balance = Math.round(balance * 1e8) * 1e-8;
	$('#balance').text(Number(balance).toFixed(8));
	var balanceUSD = balance * exchangeRate;
	if (balanceUSD > 0) {
		$('#usd-balance').text('~ $' + balanceUSD.toFixed(2));
		$('#usd-balance').show();
	} else {
		$('#usd-balance').hide();
	}
}

var getExchangeRate = function(done) {
	url = 'https://api.cryptonator.com/api/ticker/ltc-usd';
	$.getJSON(url, function(res) {
		if(res.ticker) {
			var rate = Number(res.ticker.price);
			console.log(rate);
			//if (game) game.exchangeRate = rate;
			exchangeRate = rate;
			return done(rate);
		}
	});
}

var showUSD = function() {
	console.log("getting usd")
	getExchangeRate(function(rate){
		var balance = $('#balance').text();
		var balanceUSD = balance * rate;
		$('#usd-balance').text('~ $' + balanceUSD.toFixed(2));
		$('#usd-balance').show();
		setTimeout(function() {
			showUSD;
		}, 10 * refreshInterval);
	});
}
showUSD();
