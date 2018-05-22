const {
  Amount,
  Coin,
  KeyRing,
  MTX,
  Network,
  Outpoint,
  Script,
  ScriptNum,
  Stack
} = require('bcoin');
const { WalletClient, NodeClient } = require('bclient');

const assert = require('assert');

const network = Network.get('regtest');

function createScript(locktime='100', publicKeyHash) {
  let pkh;
  if (typeof publicKeyHash === 'string')
    pkh = Buffer.from(publicKeyHash);
  else pkh = publicKeyHash;

  assert(Buffer.isBuffer(pkh), 'publicKey must be a Buffer');

  const script = new Script();
  // lock the transactions until
  // the locktime has been reached
  script.pushNum(ScriptNum.fromString(locktime, 10));
  // check the locktime
  script.pushSym('CHECKLOCKTIMEVERIFY');
  // if verifies, drop time from the stack
  script.pushSym('drop');
  // duplicate item on the top of the stack
  // which should be.the public key
  script.pushSym('dup');
  // hash the top item from the stack (the public key)
  script.pushSym('hash160')
  // push the hash to the top of the stack
  script.pushData(pkh);
  // confirm they match
  script.pushSym('equalverify');
  // confirm the signature matches
  script.pushSym('checksig');
  // Compile the script to its binary representation
  // (you must do this if you change something!).
  script.compile();
  return script;
}

/**
 * @param {Script} script to get corresponding address for
 * @param {Network} to determine encoding based on network
 * @returns {Address} - p2wsh segwit address for specified network
**/
function getAddress(script, network) {
  // get the hash of the script
  // and derive address from that
  script.compile();
  const p2wsh = script.forWitness();
  const segwitAddress = p2wsh.getAddress().toBech32(network);
  return segwitAddress;
}

/*
 * Create a coin/UTXO that locks some funds w/ our script
 * @param {Number} lockingValue - value in satoshis, defaults to 50,000
 * @param {Address} lockingAddr - "destination" for the funds
 * @returns {Coin}
 */
function createLockingCoin(lockingValue = 50000, lockingAddr) {
  const cb = new MTX();

  cb.addInput({
    prevout: new Outpoint(),
    script: new Script(),
    sequence: 0xffffffff
  });

  // Send 50,000 satoshis to our locking address.
  // this will lock up the funds to whoever can solve
  // the CLTV script
  cb.addOutput(lockingAddr, lockingValue);

  // Convert the coinbase output to a Coin object
  // In reality you might get these coins from a wallet.
  return Coin.fromTX(cb, 0, -1);
}

/* script the inputs w/ our custom script for an mtx
 * This is modeled after the scriptInput method on
 * the `MTX` class
 * @param {MTX} mtx with unscripted input
 * @param {Number} index - index of input to script
 * @param {Coin} coin- UTXO we are spending
 * @param {KeyRing} ring - keyring we are signing with
 * @returns {MTX}
*/
function scriptInput(mtx, index, coin, ring) {
  const input = mtx.inputs[index];
  const prev = coin.script;
  const wsh = prev.getWitnessScripthash();
  assert(ring instanceof KeyRing, 'Must pass a KeyRing to scriptInput');
  wredeem = ring.getRedeem(wsh);

  assert(wredeem, 'keyring has no redeem script');

  const vector = new Stack();

  // first add empty space in stack for signature and public key
  vector.pushInt(0);
  vector.pushInt(0);

  // add the raw redeem script to the stack
  vector.push(wredeem.toRaw());

  input.witness.fromStack(vector);
  mtx.inputs[index] = input;
  return mtx;
}

function signInput(mtx, index, coin, ring) {
  const input = mtx.inputs[index];
  let witness, version;

  const redeem = input.witness.getRedeem();

  assert(
    redeem,
    'Witness has not been templated'
  );

  witness = input.witness;
  version = 1;

  const stack = witness.toStack();
  // let's get the signature and replace the placeholder
  // in the stack. We can use the MTX `signature` method
  const sig =
    mtx.signature(
      index,
      wredeem,
      coin.value,
      ring.privateKey,
      null,
      version
    );
  stack.setData(0, sig);

  stack.setData(1, ring.getPublicKey());
  witness.fromStack(stack);
  return mtx;
}

/****
* THE SOLUTION
****/
// Setup some constants
const flags = Script.flags.STANDARD_VERIFY_FLAGS;
const keyring = KeyRing.generate(true);
const keyring2 = KeyRing.generate(true);
const locktime = '100';
const amountToFund = Amount.fromBTC('.5');

keyring.witness = true;
keyring2.witness = true;

// Step 1: make the script and save it to keychain
// Note: when making P2SH or P2WSH scripts,
// need to keep track of the script in order to redeem it later
const pkh = keyring.getKeyHash();
const script = createScript(locktime, pkh);
keyring.script = script;

// Step 2: create address to receive (and lock) the funds to
const lockingAddr = getAddress(script, network);

// Step 3: Create our fake tx that sends an output
// to our locking address
const coin = createLockingCoin(amountToFund.toValue(), lockingAddr);

// Now let's unlock the funds from our CLTV locking script

// Step 4: Setup our redeeming tx with the locked coin
// as our input, spending to another address, and the correct locktime
let mtx = new MTX();
mtx.addCoin(coin);
const receiveAddr = keyring2.getAddress('string', network);

// value of the input minus arbitrary amount for fee
// normally we could do this by querying our node to estimate rate
// or use the `fund` method if we had other coins to spend with
const receiveValue = coin.value - 1000;
mtx.addOutput(receiveAddr, receiveValue);

// now set the locktime
// in a live blockchain environment this will be checked against
// the current state of the chain in the mempool
// You can test if the CLTV script is working or not
// by changing this to a value less than what our script requires
// which will cause the `mtx.verify` call to fail below
mtx.setLocktime(parseInt(locktime));

// So now we have an mtx with the right input and output
// but our input still hasn't been signed
console.log('mtx:', mtx);

// Step 5: Sign and verify the input

// To do this with the bcoin API and a "live" wallet
// most of this is the same. bcoin though only checks
// for multisig smart contracts behind P2SH addresses
// so we need to manually handle the redeem script and
// signing of the transactions.
// You could make this more complex by putting a multisig
// script behind the locktime instead of a normal p2pkh
mtx = scriptInput(mtx, 0, coin, keyring);
mtx = signInput(mtx, 0, coin, keyring);

// if you console log the input being signed,
// you'll notice it now has a witness stack and redeem script
// before script, witness, and redeem were empty
console.log('signed mtx:', mtx);
assert(mtx.verify(flags), 'mtx did not verify');

// make tx immutable
const tx = mtx.toTX();
// it should still verify (need mtx's coin view to verify tx)
assert(tx.verify(mtx.view), 'tx did not verify');
console.log('Transaction verified!');

// Doing this with real money and the bcoin
// wallet system isn't too much different
// Key differences are:
// 1) We need to use real UTXOs/Coins
// 2) We need to manually keep track of the redeem script
// 3) We will interact with the REST API for signing
// of our transaction
// 4) We will need to check against the real height of
// a blockchain in order to redeem

// Step 1: Setup wallet client and confirm balance

