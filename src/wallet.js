const bip39 = require('bip39');
const { HDKey } = require('@scure/bip32');
const bitcoin = require('bitcoinjs-lib');
const { ethers } = require('ethers');
const TronWeb = require('tronweb');

const MNEMONIC = 'tus doce o veinticuatro palabras ...';

async function getMasterNode() {
  // 1) mnemónica -> seed (BIP39)
  const seed = await bip39.mnemonicToSeed(MNEMONIC); // Buffer

  // 2) seed -> HD master (BIP32)
  const master = HDKey.fromMasterSeed(seed); // @scure/bip32

  return master;
}

function deriveBitcoinAddress(master, index = 0) {
  const path = `m/44'/0'/0'/0/${index}`;
  const child = master.derive(path);

  const privateKey = child.privateKey; // Buffer
  if (!privateKey) throw new Error('No private key derived');

  const keyPair = bitcoin.ECPair.fromPrivateKey(privateKey);
  // Bech32 (P2WPKH) dirección "bc1..."
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network: bitcoin.networks.bitcoin, // mainnet
  }); //   

  return {
    path,
    privateKey: privateKey.toString('hex'),
    address,
  };
}

function deriveEthereumAddress(master, index = 0) {
  const path = `m/44'/60'/0'/0/${index}`;
  const child = master.derive(path);

  const privateKey = child.privateKey;
  if (!privateKey) throw new Error('No private key derived');

  // ethers espera "0x..." hex:
  const wallet = new ethers.Wallet('0x' + privateKey.toString('hex'));

  return {
    path,
    privateKey: wallet.privateKey, // 0x...
    address: wallet.address,       // 0x...
  };
}

async function deriveTronAddress(master, index = 0) {
  const path = `m/44'/195'/0'/0/${index}`;
  const child = master.derive(path);

  let privateKey = child.privateKey;
  if (!privateKey) throw new Error('No private key derived');

  // TronWeb espera hex sin "0x"
  let pkHex = privateKey.toString('hex');
  if (pkHex.startsWith('0x')) pkHex = pkHex.slice(2);

  const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io', // mainnet
  });

  const address = tronWeb.address.fromPrivateKey(pkHex); // T...

  return {
    path,
    privateKey: pkHex, // sin 0x
    address,
  };
}

(async () => {
  const master = await getMasterNode();

  const btc0 = deriveBitcoinAddress(master, 0);
  const eth0 = deriveEthereumAddress(master, 0);
  const trx0 = await deriveTronAddress(master, 0);

  console.log('BTC #0:', btc0);
  console.log('ETH #0:', eth0);
  console.log('TRX #0:', trx0);

})();

