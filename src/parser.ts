import { Condition, UnlockhashCondition, AtomicSwapCondition, MultisignatureCondition, TimelockCondition, NilCondition } from './conditionTypes';
import { Input, Output, Block, Transaction, Wallet, MinerFee, Currency, LastSpent } from './types';
import { Fulfillment, SingleSignatureFulfillment, AtomicSwapFulfillment, MultisignatureFulfillment, KeyPair } from './fulfillmentTypes';
import { flatten } from 'lodash'
import Decimal from 'decimal.js';

const nullId = '0000000000000000000000000000000000000000000000000000000000000000'

export class Parser {
  precision: number = 9;

  constructor (precision?: number) {
    // If a precision is provided, use this one
    if (precision) {
      this.precision = precision
    }

    // Set precision
    this.precision = Math.pow(10, this.precision);
  }

  // Returns any because when we return a union type we can't set default values for them.
  ParseJSONResponse (res: any): any {
    if (res.hashtype === 'unlockhash') {
      return this.ParseWalletAddress(res)
    }
    if (res.block && res.block.blockid != nullId) {
      return this.ParseBlock(res.block);
    }
    if (res.blocks) {
      return res.blocks.map((block: Block) => this.ParseBlock(block));
    }
    if (res.transactions) {
      return res.transactions.map((tx: Transaction) => this.ParseTransaction(tx));
    }
    if (res.transaction && res.transaction.id != nullId) {
      return this.ParseTransaction(res.transaction);
    }
  }

  ParseWalletAddress (res: any) : Wallet {
    const transactions = res.transactions;
    const blocks = res.blocks;

    // If blocks field is populated then the address is probably the address of a blockcreator
    if (blocks) return this.ParseWalletForBlockCreator(blocks, transactions);

    const address = res.transactions[0].coinoutputunlockhashes[0]

    const { spentCoinOutputs, unspentCoinOutputs, availableBalance } = this.findCoinOutputOutputAppearances(address, transactions);
    const { availableBlockstakeBalance } = this.findBlockStakeOutputOutputAppearances(address, transactions);

    const availableWalletCoinBalance = new Currency(availableBalance, this.precision);
    const availableWalletBlockStakeBalance = new Currency(availableBlockstakeBalance, this.precision);

    const wallet = new Wallet(address, availableWalletCoinBalance, availableWalletBlockStakeBalance);

    // Set Transaction on wallet object
    wallet.transactions = res.transactions.map((tx:any) => this.ParseTransaction(tx));

    // Set unspent coinoutputs on wallet object
    wallet.coinOutputs = this.parseCoinOutputsWallet(unspentCoinOutputs, false);
    // Set spent coinoutputs on wallet object
    wallet.coinOutputs = wallet.coinOutputs.concat(this.parseCoinOutputsWallet(spentCoinOutputs, true));

    return wallet
  }

  ParseWalletForBlockCreator (blocks: any, transactions: any) : Wallet {
    const address = transactions[0].blockstakeunlockhashes[0];

    const { spentMinerPayouts, unspentMinerPayouts, availableBalance: availableMinerfeeBalance } = this.findMinerPayoutAppearances(address, transactions, blocks);
    const { spentCoinOutputs, unspentCoinOutputs,lastCoinSpent, availableBalance: availableCoinBalance } = this.findCoinOutputOutputAppearances(address, transactions);
    const { availableBlockstakeBalance, unspentBlockStakesOutputsBlockCreator, lastBsSpent, spentBlockStakesOutputsBlockCreator } = this.findBlockStakeOutputOutputAppearances(address, transactions);

    // Calculate total balance
    const totalAvailableBalance = availableMinerfeeBalance.plus(availableCoinBalance)
    const availableWalletCoinBalance = new Currency(totalAvailableBalance, this.precision);

    const availableWalletBlockStakeBalance = new Currency(availableBlockstakeBalance, 1);

    let wallet = new Wallet(address, availableWalletCoinBalance, availableWalletBlockStakeBalance);

    // Set unspent minerpayouts
    wallet.minerPayouts = this.parseMinerPayoutsWallet(unspentMinerPayouts, false);
    // Set spent minerpayouts
    wallet.minerPayouts.concat(this.parseMinerPayoutsWallet(spentMinerPayouts, true));

    // Set last coin spent
    wallet.lastCoinSpent = lastCoinSpent;
    // Set last blockstake spent
    wallet.lastBlockStakeSpent = lastBsSpent;

    // Set spent coin outputs for block creator
    wallet.coinOutputsBlockCreator = this.parseCoinOutputsWallet(spentCoinOutputs, true);
    wallet.coinOutputsBlockCreator = this.parseCoinOutputsWallet(unspentCoinOutputs, false);

    // Set unspent blockstake outputs for block creator
    wallet.blockStakesOutputsBlockCreator = this.parseBlockstakeOutputsWallet(unspentBlockStakesOutputsBlockCreator, false);
    wallet.blockStakesOutputsBlockCreator = wallet.blockStakesOutputsBlockCreator.concat(this.parseBlockstakeOutputsWallet(spentBlockStakesOutputsBlockCreator, true));

    // Identifier that will tell that this is a blockcreator wallet
    wallet.isBlockCreator = true;

    return wallet;
  }

  // findCoinOutputOutputAppearances finds the spent / unspent miner payouts for an address
  findMinerPayoutAppearances (address: string, transactions: any, blocks: any) : any {
    let spentMinerPayouts: any = [];

    const unspentMinerPayouts = flatten(
      blocks.map((block: any) => {
        return block.rawblock.minerpayouts.map((mp: any, index: number) => {
          if (mp.unlockhash === address) {
            const minerPayout = block.rawblock.minerpayouts[index];
            if (minerPayout) {
              return {
                ...minerPayout,
                minerPayoutId: block.minerpayoutids[index],
                blockid: block.blockid,
                blockHeight: block.height
              };
            }
          }
        });
      })
    ).filter(Boolean) as any;

    transactions.forEach((tx: any) => {
      if (!tx.rawtransaction.data.coininputs) return;
      tx.rawtransaction.data.coininputs.forEach(
        (ci: any) => {
          const existsInUcosIndex: number = unspentMinerPayouts.findIndex(
            (uco: any) => uco.minerPayoutId === ci.parentid
          );
          if (existsInUcosIndex > -1) {
            spentMinerPayouts.push(unspentMinerPayouts[existsInUcosIndex]);
            unspentMinerPayouts.splice(existsInUcosIndex, 1);
          }
        }
      );
    });

    let availableBalance: Decimal = new Decimal(0)
    unspentMinerPayouts.map((uco: any) => {
      availableBalance = availableBalance.plus(uco.value)
    });

    return { spentMinerPayouts, unspentMinerPayouts, availableBalance }
  }

  // findCoinOutputOutputAppearances finds the spent / unspent coin outputs for an address
  findCoinOutputOutputAppearances (address: string, transactions: any) : any {
    const spentCoinOutputs: any = [];

    const unspentCoinOutputs = transactions
      .map((tx: any) => {
        if (!tx.coinoutputunlockhashes) return;
        const ucoIndex = tx.coinoutputunlockhashes.findIndex(
          (uh: any) => uh === address
        );
        const coinOutput = tx.rawtransaction.data.coinoutputs[ucoIndex];
        if (coinOutput) {
          return {
            ...coinOutput,
            coinOutputId: tx.coinoutputids[ucoIndex]
          };
        }
      })
      .filter(Boolean);

    let lastCoinSpent: LastSpent = {
      height: 0,
      txid: ''
    };

    transactions.forEach((tx: any) => {
      if (!tx.rawtransaction.data.coininputs) return;
      tx.rawtransaction.data.coininputs.forEach((ci: any) => {
        const existsInUcosIndex: number = unspentCoinOutputs.findIndex(
          (uco: any) => uco.coinOutputId === ci.parentid
        );
        if (existsInUcosIndex > -1) {
          // Save last coin spent
          if (lastCoinSpent && lastCoinSpent.height) {
            if (tx.height > lastCoinSpent.height) {
              lastCoinSpent = {
                height: tx.height,
                txid: tx.id
              };
            }
            // if it doesn't exist, initialize it
          } else {
            lastCoinSpent = {
              height: tx.height,
              txid: tx.id
            };
          }

          spentCoinOutputs.push(unspentCoinOutputs[existsInUcosIndex]);
          unspentCoinOutputs.splice(existsInUcosIndex, 1);
        }
      });
    });
    let availableBalance: Decimal = new Decimal(0)
    unspentCoinOutputs.map((uco: any) => {
      availableBalance = availableBalance.plus(uco.value)
    });

    return { spentCoinOutputs, unspentCoinOutputs, lastCoinSpent, availableBalance };
  }

  // findBlockStakeOutputOutputAppearances finds the spent / unspent blockstake outputs for an address
  findBlockStakeOutputOutputAppearances (address: string, transactions: any) : any {
    const spentBlockStakesOutputsBlockCreator: any = [];

    const ucos = transactions
      .map((tx: any) => {
        if (!tx.blockstakeunlockhashes) return;
        const buIndex = tx.blockstakeunlockhashes.findIndex(
          (uh: any) => uh === address
        );
        const blockstakeOutput =
          tx.rawtransaction.data.blockstakeoutputs[buIndex];
        if (blockstakeOutput) {
          return {
            ...blockstakeOutput,
            blockstakeOutputId: tx.blockstakeoutputids[buIndex],
            blockHeight: tx.height,
            txid: tx.id
          };
        }
      })
      .filter(Boolean);

    let lastBsSpent: LastSpent = {
      height: 0,
      txid: ''
    };

    transactions.forEach((tx: any) => {
      if (!tx.rawtransaction.data.blockstakeinputs) return;
      const spentUcos = tx.rawtransaction.data.blockstakeinputs.map(
        (ci: any) => {
          const existsInBusIndex: number = ucos.findIndex(
            (uco: any) => uco.blockstakeOutputId === ci.parentid
          );
          if (existsInBusIndex > -1) {
            // Save last bs spent
            if (lastBsSpent && lastBsSpent.height) {
              if (tx.height > lastBsSpent.height) {
                lastBsSpent = {
                  height: tx.height,
                  txid: tx.id
                };
              }
              // if it doesn't exist, initialize it
            } else {
              lastBsSpent = {
                height: tx.height,
                txid: tx.id
              };
            }

            spentBlockStakesOutputsBlockCreator.push(ucos[existsInBusIndex]);
            ucos.splice(existsInBusIndex, 1);
          }
        }
      );
    });

    let availableBlockstakeBalance: Decimal = new Decimal(0)
    ucos.map((uco: any) => {
      availableBlockstakeBalance = availableBlockstakeBalance.plus(uco.value)
    });

    const unspentBlockStakesOutputsBlockCreator = ucos;

    return { availableBlockstakeBalance, unspentBlockStakesOutputsBlockCreator, lastBsSpent, spentBlockStakesOutputsBlockCreator };
  }

  ParseBlock (block:any) : Block {
    const { blockid:id, height, transactions, rawblock } = block;
    const { timestamp, minerpayouts } = rawblock;

    const parsedTransactions = transactions.map((tx: any) => this.ParseTransaction(tx, id, height, timestamp))
    const parsedBlock = new Block(id, height, timestamp, parsedTransactions);

    if (minerpayouts.length > 0) {
      parsedBlock.minerFees = minerpayouts.map((mp:MinerFee) => {
        return {
          value: new Currency(mp.value, this.precision),
          unlockhash: mp.unlockhash
        }
      })
    }
    return parsedBlock
  }

  ParseTransaction (tx: any, blockId?: string, blockHeight?: number, blockTime?: number) : Transaction {
    const { rawtransaction, id, unconfirmed } = tx;
    const { version } = tx.rawtransaction;

    // Create the Transaction
    let transaction = new Transaction(version);

    // Set blockConstants
    transaction.blockId = blockId;
    transaction.blockHeight = blockHeight;
    transaction.blockTime = blockTime;

    transaction.id = id;
    transaction.unconfirmed = unconfirmed;

    const bsOutputs = rawtransaction.data.blockstakeoutputs || [];
    const bsOutputIds = tx.blockstakeoutputids || [];
    const bsInputs = rawtransaction.data.blockstakeinputs || [];

    const coinOutputs = rawtransaction.data.coinoutputs || [];
    const coinOutputIds = tx.coinoutputids || [];
    const coinInputs = rawtransaction.data.coininputs || [];

    transaction.blockstakeInputs = this.getInputs(bsInputs);
    transaction.blockstakeOutputs = this.getBlockstakeOutputs(bsOutputs, bsOutputIds);

    transaction.coinInputs = this.getInputs(coinInputs);
    transaction.coinOutputs = this.getOutputs(coinOutputs, coinOutputIds);

    // todo add arbitrary data and extension props

    return transaction
  }

  getOutputs(outputs: any, outputIds: any): Output[] {
    return outputs.map((output: Output, index: number) => {
      return {
        id: outputIds[index],
        value: new Currency(output.value, this.precision),
        condition: this.getCondition(output)
      };
    });
  }

  parseCoinOutputsWallet(outputs: any, spent: boolean): Output[] {
    return outputs.map((output: any) => {
      return {
        id: output.coinOutputId,
        value: new Currency(output.value, this.precision),
        spent
      };
    });
  }

  parseMinerPayoutsWallet(minerpayouts: any, spent: boolean): Output[] {
    return minerpayouts.map((mp: any) => {
      return {
        id: mp.minerPayoutId,
        value: new Currency(mp.value, this.precision),
        spent
      };
    });
  }

  getBlockstakeOutputs(outputs: any, outputIds: any): Output[] {
    return outputs.map((output: Output, index: number) => {
      return {
        id: outputIds[index],
        value: new Currency(output.value, 1),
        condition: this.getCondition(output)
      };
    });
  }

  parseBlockstakeOutputsWallet(outputs: any, spent: boolean): Output[] {
    return outputs.map((output: any, index: number) => {
      return {
        id: output.blockstakeOutputId,
        value: new Currency(output.value, 1),
        spent
      };
    });
  }

  getInputs(inputs: any): Input[] {
    return inputs.map((input: Input) => {
      return {
        parentid: input.parentid,
        fulfillment: this.getFulfillment(input)
      };
    });
  }

  getCondition (output: any) : Condition {
    // If no condition object is present on the output we assume its a legacy condition
    // Legacy conditions are always single signature unlockhash conditions.
    if (!output.condition) {
      return new UnlockhashCondition(1, output.unlockhash)
    }

    const { data } = output.condition
    switch (output.condition.type) {
      case 1:
        // TODO set value
        return new UnlockhashCondition(1, output.condition.data.unlockhash);
      case 2:
        const { sender, receiver, hashedSecret, timelock } = data
        return new AtomicSwapCondition(2, sender, receiver, hashedSecret, timelock)
      case 3:
        let condition: MultisignatureCondition|UnlockhashCondition|NilCondition;
        if (data.unlockhashes) {
          condition = new MultisignatureCondition(4, data.unlockhashes, data.minimumsignaturecount);
        } else if (data.unlockhash) {
          condition = new UnlockhashCondition(1, output.condition.data.unlockhash);
        } else {
          return new UnlockhashCondition(1, output.unlockhash);
        }
        return new TimelockCondition(3, data.locktime, condition)
      case 4:
        return new MultisignatureCondition(4, data.unlockhashes, data.minimumsignaturecount)
      default:
        throw new Error("Condition is not recongnised on data")
    }
  }

  getFulfillment (input: any) : Fulfillment {
    // If unlocker object is present on the input, we assume its a legacy input.
    // Convert this legacy input to our current input type
    if (input.unlocker) {
      input.fulfillment = {}
      input.fulfillment.type = input.unlocker.type
      input.fulfillment.data = {
        publickey: input.unlocker.condition.publickey,
        signature: input.unlocker.fulfillment.signature
      }
    }

    const { data } = input.fulfillment
    switch (input.fulfillment.type) {
      case 1:
        return new SingleSignatureFulfillment(1, data.publickey, data.signature);
      case 2:
        let atomicSwapFulfillment: AtomicSwapFulfillment = new AtomicSwapFulfillment(1, data.publickey, data.signature);
        if (data.secret) {
          atomicSwapFulfillment.secret = data.secret
        }
        return atomicSwapFulfillment
      case 3:
        const { pairs } = data
        const keypairs = pairs.map((p:KeyPair) => {
          return {
            publickey: p.publickey,
            signature: p.signature
          }
        })
        return new MultisignatureFulfillment(3, keypairs)
      default:
        throw new Error("Fulfillment is not recongnised on data")
    }
  }
}