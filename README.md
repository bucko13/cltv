# CLTV (CHECK LOCKTIME VERIFY)
CLTV is an op code in the Bitcoin scripting language that allows you to lock a UTXO (Unspent Transaction Output)
by time. i.e. a coin cannot be spent until a certain time or blockchain height has been past.

This is the code for a corresponding guide to using CLTV with [bcoin](http://bcoin.io)

## Guide
Sending funds in Bitcoin is really just about proving ownership of funds
by pointing to the output of a previous transaction, making that the input
for a new transaction. "Scripts" are conditions that need to be satisfied
on an output to prove ownership. You can have a Bitcoin script that is locked with
the math problem "What is 2 + 5", and anyone that knows to answer "7" can "prove"
ownership over that output (Check out this guide, [Intro To Scripting](http://bcoin.io/guides/scripting.html)
to see how to write these scripts in bcoin). Generally though, you prove ownership
by signing a transaction input with the private key (basically a password
that is stored in your wallet) that corresponds to the address that the source output
was sent to.

An output that is locked with CLTV works more or less the same way but adds another
condition that before the signature is even accepted, a certain amount of time must have passed.
In pseudo-code, the script will look like this:

```
Locktime (in blocks or Unix epoch time)
Check if locktime is less than nLocktime of transaction; execution fails if not
Check public key hash matches
Check if the signature validates
```

To learn more about CLTV and how it works in Bitcoin, checkout [chapter 07 in Mastering Bitcoin](https://github.com/bitcoinbook/bitcoinbook/blob/develop/ch07.asciidoc)

We will use bcoin's Script class to construct our locking script.

There are two solutions in the code. One that creates, redeems, and verifies a CLTV transaction and another that does the same thing on a live regtest network.

