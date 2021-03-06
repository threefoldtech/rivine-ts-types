import Decimal from 'decimal.js'
import { find, flatten } from 'lodash'
import {
  AtomicSwapCondition, Condition, MultisignatureCondition,
  NilCondition, TimelockCondition, UnlockhashCondition, ConditionType, CustodyFeeCondition
} from './conditionTypes'
import { AtomicSwapFulfillment, Fulfillment, KeyPair, MultisignatureFulfillment, SingleSignatureFulfillment } from './fulfillmentTypes'
import {
  Block, BlockstakeOutputInfo, CoinOutputInfo, Currency, Input,
  LastSpent, MinerPayout, Output, Wallet, CustodyFeeMinerPayout, CustodyOutput, CustodyInput
} from './types'
import { Transaction, DefaultTransaction, CoinCreationTransaction, MinterDefinitionTransaction } from './transactionTypes'

const nullId = '0000000000000000000000000000000000000000000000000000000000000000'
// Void address of custody fees
const custodyVoidAddress = '800000000000000000000000000000000000000000000000000000000000000000af7bedde1fea'

export class Parser {
  public precision: number = 9
  private hash: string

  constructor (precision?: number) {
    // If a precision is provided, use this one
    if (precision) {
      this.precision = precision
    }

    // Set precision
    this.precision = Math.pow(10, this.precision)

    this.hash = ''
  }

  // Returns any because when we return a union type we can't set default values for them.
  public ParseHashResponseJSON (res: any, hash: string): any {
    // Save hash in state
    this.hash = hash

    if (this.hash === custodyVoidAddress) {
      return this.parseCustodyVoidAddress(res)
    }
    if (res.hashtype === 'unlockhash') {
      return this.parseWalletAddress(res)
    }
    if (res.hashtype === 'coinoutputid') {
      return this.parseCoinOutput(res)
    }
    if (res.hashtype === 'blockstakeoutputid') {
      return this.parseBlockStakeOutput(res)
    }
    if (res.block && res.block.blockid !== nullId) {
      return this.parseBlock(res.block)
    }
    if (res.transaction && res.transaction.id !== nullId) {
      return this.parseTransaction(res.transaction)
    }
  }

  public ParseBlockResponseJSON (res: any): Block {
    return this.parseBlock(res.block)
  }

  private parseWalletAddress (res: any): Wallet {
    const { transactions, blocks, multisigaddresses } = res

    // If blocks field is populated then the address is probably the address of a blockcreator
    if (blocks) { return this.parseWalletForBlockCreator(blocks, transactions, multisigaddresses) }

    const { spentCoinOutputs, unspentCoinOutputs, availableBalance, lastCoinSpent }
      = this.findCoinOutputOutputAppearances(this.hash, transactions)
    const { availableBlockstakeBalance } = this.findBlockStakeOutputOutputAppearances(this.hash, transactions)

    const availableWalletCoinBalance = new Currency(availableBalance, this.precision)
    const availableWalletBlockStakeBalance = new Currency(availableBlockstakeBalance, this.precision)

    const wallet = new Wallet(this.hash, availableWalletCoinBalance, availableWalletBlockStakeBalance)

    // Set Transaction on wallet object
    wallet.transactions = res.transactions.map((tx: any) => this.parseTransaction(tx))

    // Set last coin spentlet.lastCoinSpent = lastCoinSpent
    wallet.lastCoinSpent = lastCoinSpent

    // Set unspent coinoutputs on wallet object
    wallet.coinOutputs = this.parseCoinOutputsWallet(unspentCoinOutputs, false)
    // Set spent coinoutputs on wallet object
    wallet.coinOutputs
      = wallet.coinOutputs.concat(this.parseCoinOutputsWallet(spentCoinOutputs, true))

    if (multisigaddresses) {
      wallet.multisigAddressess = multisigaddresses
    }

    return wallet
  }

  private parseWalletForBlockCreator (blocks: any, transactions: any, multisigAddresses: string[]): Wallet {
    const { spentMinerPayouts, unspentMinerPayouts, availableBalance: availableMinerfeeBalance }
      = this.findMinerPayoutAppearances(this.hash, transactions, blocks)
    // tslint:disable-next-line
    const { spentCoinOutputs, unspentCoinOutputs,lastCoinSpent, availableBalance: availableCoinBalance }
      = this.findCoinOutputOutputAppearances(this.hash, transactions)
    const {
      availableBlockstakeBalance, unspentBlockStakesOutputsBlockCreator,
      lastBsSpent, spentBlockStakesOutputsBlockCreator
    }
      = this.findBlockStakeOutputOutputAppearances(this.hash, transactions)

    // Calculate total balance
    const totalAvailableBalance = availableMinerfeeBalance.plus(availableCoinBalance)
    const availableWalletCoinBalance = new Currency(totalAvailableBalance, this.precision)

    const availableWalletBlockStakeBalance = new Currency(availableBlockstakeBalance, 1)

    const wallet = new Wallet(this.hash, availableWalletCoinBalance, availableWalletBlockStakeBalance)

    // Set unspent minerpayouts
    wallet.minerPayouts = this.parseMinerPayoutsWallet(unspentMinerPayouts, false)
    // Set spent minerpayouts
    wallet.minerPayouts.concat(this.parseMinerPayoutsWallet(spentMinerPayouts, true))

    // Set last coin spent
    wallet.lastCoinSpent = lastCoinSpent
    // Set last blockstake spent
    wallet.lastBlockStakeSpent = lastBsSpent

    // Set spent coin outputs for block creator
    wallet.coinOutputsBlockCreator = this.parseCoinOutputsWallet(spentCoinOutputs, true)
    wallet.coinOutputsBlockCreator = wallet.coinOutputsBlockCreator
      .concat(this.parseCoinOutputsWallet(unspentCoinOutputs, false))

    // Set unspent blockstake outputs for block creator
    wallet.blockStakesOutputsBlockCreator
      = this.parseBlockstakeOutputsWallet(unspentBlockStakesOutputsBlockCreator, false)
    wallet.blockStakesOutputsBlockCreator = wallet.blockStakesOutputsBlockCreator
        .concat(this.parseBlockstakeOutputsWallet(spentBlockStakesOutputsBlockCreator, true))

    // Identifier that will tell that this is a blockcreator wallet
    wallet.isBlockCreator = true

    if (multisigAddresses) {
      wallet.multisigAddressess = multisigAddresses
    }

    return wallet
  }

  private parseCustodyVoidAddress (res: any): Wallet {
    const { transactions } = res

    const { spentCoinOutputs, unspentCoinOutputs, availableBalance, lastCoinSpent }
      = this.findCoinOutputOutputAppearances(this.hash, transactions)

    const availableWalletCoinBalance = new Currency(availableBalance, this.precision)

    // No blockstake balance is available on a custody void address
    const availableWalletBlockStakeBalance = new Currency(0, this.precision)

    const wallet = new Wallet(this.hash, availableWalletCoinBalance, availableWalletBlockStakeBalance)

    // Set Transaction on wallet object
    wallet.transactions = res.transactions.map((tx: any) => this.parseTransaction(tx))

    // Set last coin spentlet.lastCoinSpent = lastCoinSpent
    wallet.lastCoinSpent = lastCoinSpent

    // Set unspent coinoutputs on wallet object
    wallet.coinOutputs = this.parseCoinOutputsWallet(unspentCoinOutputs, false)
    // Set spent coinoutputs on wallet object
    wallet.coinOutputs
      = wallet.coinOutputs.concat(this.parseCoinOutputsWallet(spentCoinOutputs, true))

    // Indicate its a custody void wallet
    wallet.isCustodyVoid = true

    return wallet
  }

  // findCoinOutputOutputAppearances finds the spent / unspent miner payouts for an address
  private findMinerPayoutAppearances (address: string, transactions: any, blocks: any): any {
    const spentMinerPayouts: any = []

    const unspentMinerPayouts = flatten(
      blocks.map((block: any) => {
        return block.rawblock.minerpayouts.map((mp: any, index: number) => {
          if (mp.unlockhash === address) {
            const minerPayout = block.rawblock.minerpayouts[index]
            if (minerPayout) {
              return {
                ...minerPayout,
                minerPayoutId: block.minerpayoutids[index],
                blockid: block.blockid,
                blockHeight: block.height
              }
            }
          }
        })
      })
    ).filter(Boolean) as any

    transactions.forEach((tx: any) => {
      if (!tx.rawtransaction.data.coininputs) { return }
      tx.rawtransaction.data.coininputs.forEach(
        (ci: any) => {
          const existsInUcosIndex: number = unspentMinerPayouts.findIndex(
            (uco: any) => uco.minerPayoutId === ci.parentid
          )
          if (existsInUcosIndex > -1) {
            spentMinerPayouts.push(unspentMinerPayouts[existsInUcosIndex])
            unspentMinerPayouts.splice(existsInUcosIndex, 1)
          }
        }
      )
    })

    let availableBalance: Decimal = new Decimal(0)
    unspentMinerPayouts.map((uco: any) => {
      availableBalance = availableBalance.plus(uco.value)
    })

    return { spentMinerPayouts, unspentMinerPayouts, availableBalance }
  }

  // findCoinOutputOutputAppearances finds the spent / unspent coin outputs for an address
  private findCoinOutputOutputAppearances (address: string, transactions: any): any {
    const spentCoinOutputs: any = []

    const unspentCoinOutputs = transactions
      .map((tx: any) => {
        if (!tx.coinoutputunlockhashes) return
        const ucoIndex = tx.coinoutputunlockhashes.findIndex(
          (uh: any) => uh === address
        )
        const coinOutput = tx.rawtransaction.data.coinoutputs[ucoIndex]
        let coinOutputCustodyFee = {}
        if (tx.coinoutputcustodyfees) {
          coinOutputCustodyFee = tx.coinoutputcustodyfees[ucoIndex]
        }

        if (coinOutput) {
          return {
            ...coinOutput,
            ...coinOutputCustodyFee,
            coinOutputId: tx.coinoutputids[ucoIndex],
            blockHeight: tx.height,
            txid: tx.id,
            address
          }
        }
      })
      .filter(Boolean)

    let lastCoinSpent: LastSpent = {
      height: 0,
      txid: ''
    }

    transactions.forEach((tx: any) => {
      if (!tx.rawtransaction.data.coininputs) return
      tx.rawtransaction.data.coininputs.forEach((ci: any) => {
        const existsInUcosIndex: number = unspentCoinOutputs.findIndex(
          (uco: any) => uco.coinOutputId === ci.parentid
        )
        if (existsInUcosIndex > -1) {
          // Save last coin spent
          if (lastCoinSpent && lastCoinSpent.height) {
            if (tx.height > lastCoinSpent.height) {
              lastCoinSpent = {
                height: tx.height,
                txid: tx.id
              }
            }
            // if it doesn't exist, initialize it
          } else {
            lastCoinSpent = {
              height: tx.height,
              txid: tx.id
            }
          }

          spentCoinOutputs.push(unspentCoinOutputs[existsInUcosIndex])
          unspentCoinOutputs.splice(existsInUcosIndex, 1)
        }
      })
    })
    let availableBalance: Decimal = new Decimal(0)
    unspentCoinOutputs.map((uco: any) => {
      availableBalance = availableBalance.plus(uco.value)
    })

    return { spentCoinOutputs, unspentCoinOutputs, lastCoinSpent, availableBalance }
  }

  // findBlockStakeOutputOutputAppearances finds the spent / unspent blockstake outputs for an address
  private findBlockStakeOutputOutputAppearances (address: string, transactions: any): any {
    const spentBlockStakesOutputsBlockCreator: any = []

    const ucos = transactions
      .map((tx: any) => {
        if (!tx.blockstakeunlockhashes) return
        const buIndex = tx.blockstakeunlockhashes.findIndex(
          (uh: any) => uh === address
        )
        const blockstakeOutput =
          tx.rawtransaction.data.blockstakeoutputs[buIndex]
        if (blockstakeOutput) {
          return {
            ...blockstakeOutput,
            blockstakeOutputId: tx.blockstakeoutputids[buIndex],
            blockHeight: tx.height,
            txid: tx.id
          }
        }
      })
      .filter(Boolean)

    let lastBsSpent: LastSpent = {
      height: 0,
      txid: ''
    }

    transactions.forEach((tx: any) => {
      if (!tx.rawtransaction.data.blockstakeinputs) return
      const spentUcos = tx.rawtransaction.data.blockstakeinputs.map(
        (ci: any) => {
          const existsInBusIndex: number = ucos.findIndex(
            (uco: any) => uco.blockstakeOutputId === ci.parentid
          )
          if (existsInBusIndex > -1) {
            // Save last bs spent
            if (lastBsSpent && lastBsSpent.height) {
              if (tx.height > lastBsSpent.height) {
                lastBsSpent = {
                  height: tx.height,
                  txid: tx.id
                }
              }
              // if it doesn't exist, initialize it
            } else {
              lastBsSpent = {
                height: tx.height,
                txid: tx.id
              }
            }

            spentBlockStakesOutputsBlockCreator.push(ucos[existsInBusIndex])
            ucos.splice(existsInBusIndex, 1)
          }
        }
      )
    })

    let availableBlockstakeBalance: Decimal = new Decimal(0)
    ucos.map((uco: any) => {
      availableBlockstakeBalance = availableBlockstakeBalance.plus(uco.value)
    })

    const unspentBlockStakesOutputsBlockCreator = ucos

    return { availableBlockstakeBalance, unspentBlockStakesOutputsBlockCreator,
      lastBsSpent, spentBlockStakesOutputsBlockCreator }
  }

  private parseBlock (block: any): Block {
    const
      { blockid: id, height, transactions, rawblock, minerpayoutids, estimatedactivebs, minerpayoutcustodyfees } = block
    const { timestamp, minerpayouts, parentid } = rawblock

    const parsedTransactions = transactions.map((tx: any) => this.parseTransaction(tx, id, timestamp))
    const parsedBlock = new Block(id, height, timestamp, parsedTransactions, parentid, estimatedactivebs)

    parsedBlock.minerPayouts
      = this.parseMinerPayoutsBlock(minerpayouts, minerpayoutcustodyfees, minerpayoutids, transactions)

    return parsedBlock
  }

  private parseTransaction
  (tx: any, blockId?: string, blockTime?: number): Transaction | undefined {
    const { version } = tx.rawtransaction
    switch (version) {
      case 0:
        return this.parseCoinOrBlockStakeTransaction(tx, blockId, blockTime)
      case 1:
        return this.parseCoinOrBlockStakeTransaction(tx, blockId, blockTime)
      case 128:
        return this.parseMinterDefinitionTransaction(tx, blockId, blockTime)
      case 129:
        return this.parseCoinCreationTransaction(tx, blockId, blockTime)
      default:
        return
    }
  }

  private parseCoinOrBlockStakeTransaction
  (tx: any, blockId?: string, blockTime?: number): Transaction {
    const { rawtransaction, id, unconfirmed, coininputoutputs, blockstakeinputoutputs, height } = tx
    const { version } = tx.rawtransaction

    const bsOutputs = rawtransaction.data.blockstakeoutputs || []
    const bsOutputIds = tx.blockstakeoutputids || []
    const bsInputs = rawtransaction.data.blockstakeinputs || []

    const coinOutputs = rawtransaction.data.coinoutputs || []
    const coinOutputIds = tx.coinoutputids || []
    const coinOutputUnlockhashes = tx.coinoutputunlockhashes || []
    const coinInputs = rawtransaction.data.coininputs || []
    const coinOutputCustodyFees = tx.coinoutputcustodyfees || []

    // todo add arbitrary data and extension props
    let transaction: DefaultTransaction = new DefaultTransaction(version)

    transaction.blockStakeOutputs = this.getBlockstakeOutputs(bsOutputs, bsOutputIds)
    const blockStakeInputsOutputs = this.getBlockstakeOutputs(blockstakeinputoutputs, bsOutputIds)
    transaction.blockStakeInputs = this.getInputs(bsInputs, blockStakeInputsOutputs, blockstakeinputoutputs)

    transaction.coinOutputs = this.getOutputs(coinOutputs, coinOutputIds, coinOutputUnlockhashes, coinOutputCustodyFees)
    const coinInputsOutputs
      = this.getOutputs(coininputoutputs, coinOutputIds, coinOutputUnlockhashes, coinOutputCustodyFees)
    transaction.coinInputs = this.getInputs(coinInputs, coinInputsOutputs, coininputoutputs)

    // Set blockConstants
    transaction.blockId = blockId
    transaction.blockHeight = height
    transaction.blockTime = blockTime

    transaction.id = id
    transaction.unconfirmed = unconfirmed

    return transaction
  }

  private parseMinterDefinitionTransaction
  (tx: any, blockId?: string, blockTime?: number): MinterDefinitionTransaction {
    const { rawtransaction, id, unconfirmed, height } = tx
    const { data, version } = rawtransaction

    const { mintfulfillment, mintcondition } = data
    const parsedMintFulfillment = this.getFulfillment({ fulfillment: mintfulfillment })
    const parsedMintCondition = this.getCondition({ condition: mintcondition }, [], 0)
    const transaction = new MinterDefinitionTransaction(version, parsedMintFulfillment, parsedMintCondition)

    // Set blockConstants
    transaction.blockId = blockId
    transaction.blockHeight = height
    transaction.blockTime = blockTime

    transaction.id = id
    transaction.unconfirmed = unconfirmed

    return transaction
  }

  private parseCoinCreationTransaction
  (tx: any, blockId?: string, blockTime?: number): CoinCreationTransaction {
    const { rawtransaction, id, unconfirmed, coinoutputids, coinoutputunlockhashes, height } = tx
    const { data, version } = rawtransaction
    const coinOutputCustodyFees = tx.coinoutputcustodyfees || []

    const { mintfulfillment, coinoutputs } = data

    const parsedMintFulfillment = this.getFulfillment({ fulfillment: mintfulfillment })
    const parsedOutputs = this.getOutputs(coinoutputs, coinoutputids, coinoutputunlockhashes, coinOutputCustodyFees)

    const transaction = new CoinCreationTransaction(version, parsedMintFulfillment, parsedOutputs)

    // Set blockConstants
    transaction.blockId = blockId
    transaction.blockHeight = height
    transaction.blockTime = blockTime

    transaction.id = id
    transaction.unconfirmed = unconfirmed

    return transaction
  }

  // parseCoinOutput gets coinoutput information for a normal coin outputs and also for blockcreator coin outputs
  private parseCoinOutput (res: any): CoinOutputInfo | undefined {
    const { blocks, transactions } = res
    let parsedTransactions: Transaction[] = []
    let parsedBlocks: Block[] = []

    if (transactions) {
      parsedTransactions = transactions.map((tx: DefaultTransaction) => this.parseTransaction(tx))
    }

    if (blocks) {
      parsedBlocks = blocks.map((block: Block) => this.parseBlock(block)) as Block[]
    }


    let coinOutput: any
    let coinInput: any

    parsedTransactions.forEach((tx: any) => {
      const { coinOutputs, coinInputs } = tx

      // If coinoutputs are defined, start looking for the coinoutput that matches our hash
      if (coinOutputs) {
        // Only try finding output when there is none present, else it will override with undefined
        if (!coinOutput) {
          coinOutput = find(coinOutputs, (co: Output) => co.id === this.hash) as Output
          // If found set txid
          if (coinOutput) {
            coinOutput.txId = tx.id
          }
        }
      }

      // If coininputs are defined, start looking for the coininput that matches our hash
      if (coinInputs) {
        // If a coininput with parent id equal to the hash we are looking for is found that the output is spent
        if (!coinInput) {
          coinInput = find(coinInputs, (co: Input) => co.parentid === this.hash) as Input
          // If found set txid
          if (coinInput) {
            coinInput.txId = tx.id
          }
        }
      }
    })

    // If no coin ouput is found then it is most likely a blockcreator output.
    // we now look inside the minerfees if we can find this output
    if (!coinOutput) {
      parsedBlocks.forEach((block: Block) => {
        const minerFee = find(block.minerPayouts, (mf: MinerPayout) => mf.id === this.hash) as MinerPayout
        if (minerFee) {
          coinOutput = {
            id: minerFee.id,
            value: minerFee.value,
            blockId: block.id,
            isBlockCreatorReward: true,
            unlockhash: minerFee.unlockhash
          } as Output
        }
      })
    }

    // Wrap found coinout / coininput and return
    const coinOutputInfo = new CoinOutputInfo(coinOutput)
    if (coinInput) {
      coinOutputInfo.input = coinInput
    }
    return coinOutputInfo
  }

  private parseBlockStakeOutput (res: any): BlockstakeOutputInfo | undefined {
    const { transactions } = res

    const parsedTransactions = transactions.map((tx: DefaultTransaction) => this.parseTransaction(tx))

    let blockStakeOutput: any
    let blockStakeInput: any

    parsedTransactions.forEach((tx: DefaultTransaction) => {
      const { blockStakeOutputs, blockStakeInputs } = tx

      // If blockStakeOutputs are defined, start looking for the blockStakeOutput that matches our hash
      if (blockStakeOutputs) {
        // Only try finding output when there is none present, else it will override with undefined
        if (!blockStakeOutput) {
          blockStakeOutput = find(blockStakeOutputs, (co: Output) => co.id === this.hash) as Output
          // If found set txid
          if (blockStakeOutput) {
            blockStakeOutput.txId = tx.id
          }
        }
      }

      // If blockStakeInputs are defined, start looking for the blockStakeInput that matches our hash
      if (blockStakeInputs) {
        // If a blockStakeInput with parent id equal to the hash we are looking for is found that the output is spent
        if (!blockStakeInput) {
          blockStakeInput = find(blockStakeInputs, (co: Input) => co.parentid === this.hash) as Input
          // If found set txid
          if (blockStakeInput) {
            blockStakeInput.txId = tx.id
          }
        }
      }
    })

    // Wrap found blockStakeOutput / blockStakeInput and return
    const blockStakeOutputInfo = new BlockstakeOutputInfo(blockStakeOutput)
    if (blockStakeInput) {
      blockStakeOutputInfo.input = blockStakeInput
    }
    return blockStakeOutputInfo
  }

  private getOutputs (outputs: any, outputIds: any, coinOutputUnlockhashes: any, coinOutputCustodyFees: any): Output[] {
    if (!outputs) return []
    // console.log(outputs)
    return outputs.map((output: Output | CustodyOutput, index: number) => {
      let out = {
        id: outputIds[index],
        value: new Currency(output.value, this.precision),
        condition: this.getCondition(output, coinOutputUnlockhashes, index)
      }
      if (coinOutputCustodyFees && coinOutputCustodyFees.length > 0) {
        if (!coinOutputCustodyFees[index]) return
        const custodyFeeOutput: CustodyOutput = {
          ...out,
          creationTime: coinOutputCustodyFees[index].creationtime,
          isCustodyFee: coinOutputCustodyFees[index].iscustodyfee,
          feeComputationTime: coinOutputCustodyFees[index].feecomputationtime,
          spent: coinOutputCustodyFees[index].spent
        }
        if (coinOutputCustodyFees[index].custodyfee && coinOutputCustodyFees[index].custodyfee > 0) {
          custodyFeeOutput.custodyFee = new Currency(coinOutputCustodyFees[index].custodyfee, this.precision)
        }
        if (coinOutputCustodyFees[index].spendablevalue && coinOutputCustodyFees[index].spendablevalue > 0) {
          custodyFeeOutput.spendableValue = new Currency(coinOutputCustodyFees[index].spendablevalue, this.precision)
        }
        return custodyFeeOutput
      } else {
        return out
      }
    })
  }

  private parseCoinOutputsWallet (outputs: any, spent: boolean): Output[] {
    return outputs.map((output: any, index: number) => {
      let out: Output | CustodyOutput = {
        id: output.coinOutputId,
        value: new Currency(output.value, this.precision),
        spent,
        blockHeight: output.blockHeight,
        txId: output.txid,
        condition: this.getCondition(output, [output.address], 0)
      }
      // if output.iscustodyfee is present on the obj then we know all the remaining properties will also be there
      if (output.iscustodyfee !== undefined) {
        out = {
          ...out,
          creationTime: output.creationtime,
          isCustodyFee: output.iscustodyfee,
          feeComputationTime: output.feecomputationtime
        }

        if (output.custodyfee && output.custodyfee > 0) {
          out.custodyFee = new Currency(output.custodyfee, this.precision)
        }
        if (output.spendableValue && output.spendableValue > 0) {
          out.spendableValue = new Currency(output.spendableValue, this.precision)
        }
      }
      return out
    })
  }

  private parseMinerPayoutsWallet (minerpayouts: any, spent: boolean): Output[] {
    return minerpayouts.map((mp: any) => {
      return {
        id: mp.minerPayoutId,
        value: new Currency(mp.value, this.precision),
        spent,
        blockId: mp.blockid,
        unlockhash: mp.unlockhash
      }
    })
  }

  private getBlockstakeOutputs (outputs: any, outputIds: any): Output[] {
    if (!outputs) return []
    return outputs.map((output: Output, index: number) => {
      return {
        id: outputIds[index],
        value: new Currency(output.value, 1),
        condition: this.getCondition(output, [], 0)
      }
    })
  }

  private parseBlockstakeOutputsWallet (outputs: any, spent: boolean): Output[] {
    return outputs.map((output: any, index: number) => {
      return {
        id: output.blockstakeOutputId,
        value: new Currency(output.value, 1),
        spent,
        blockHeight: output.blockHeight,
        condition: this.getCondition(output, [], 0),
        txId: output.txid
      }
    })
  }

  private getInputs (inputs: any, outputs: any, inputsOutputs: any): [Input] {
    return inputs.map((input: Input | CustodyInput, index: number) => {
      const parentOutput = outputs[index]
      let parsedInput: Input | CustodyInput = {
        parentid: input.parentid,
        fulfillment: this.getFulfillment(input)
      }
      if (parentOutput) {
        parsedInput = {
          ...parsedInput,
          parentOutput
        }
      }

      // If there is a custody fee, set it on the input
      if (inputsOutputs[index].custody) {
        const { custody } = inputsOutputs[index]
        parsedInput = {
          ...parsedInput,
          creationTime: custody.creationtime,
          isCustodyFee: custody.iscustodyfee,
          feeComputationTime: custody.feecomputationtime,
          custodyFee: new Currency(custody.custodyfee, this.precision),
          spendableValue: new Currency(custody.spendablevalue, this.precision),
          spent: custody.spent
        }
      }

      return parsedInput
    })
  }

  private getCondition (output: any, coinOutputUnlockhashes: any, index: number): Condition {
    // If no condition object is present on the output we assume its a legacy condition
    // Legacy conditions are always single signature unlockhash conditions.
    if (!output.condition) {
      return new UnlockhashCondition(1, output.unlockhash)
    }

    const { data } = output.condition
    switch (output.condition.type) {
      case ConditionType.UnlockhashCondition:
        // TODO set value
        return new UnlockhashCondition(1, output.condition.data.unlockhash)
      case ConditionType.AtomicSwapCondition:
        const { sender, receiver, hashedsecret, timelock } = data
        return new AtomicSwapCondition(2, sender, receiver, coinOutputUnlockhashes[index], hashedsecret, timelock)
      case ConditionType.TimelockCondition:
        let condition: MultisignatureCondition | UnlockhashCondition | NilCondition
        if (data.unlockhashes) {
          condition =
            new MultisignatureCondition(4, data.unlockhashes, data.minimumsignaturecount, coinOutputUnlockhashes[index])
        } else if (data.unlockhash) {
          condition = new UnlockhashCondition(1, output.condition.data.unlockhash)
        } else {
          return new UnlockhashCondition(1, output.unlockhash)
        }
        return new TimelockCondition(3, data.locktime, condition)
      case ConditionType.MultisignatureCondition:
        return new
          MultisignatureCondition(4, data.unlockhashes, data.minimumsignaturecount, coinOutputUnlockhashes[index])
      case ConditionType.CustodyFeeCondition:
        return new CustodyFeeCondition(128, coinOutputUnlockhashes[index])
      default:
        throw new Error('Condition is not recongnised on data')
    }
  }

  private getFulfillment (input: any): Fulfillment {
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
        return new SingleSignatureFulfillment(1, data.publickey, data.signature)
      case 2:
        const atomicSwapFulfillment: AtomicSwapFulfillment
          = new AtomicSwapFulfillment(1, data.publickey, data.signature)
        if (data.secret) {
          atomicSwapFulfillment.secret = data.secret
        }
        return atomicSwapFulfillment
      case 3:
        const { pairs } = data
        const keypairs = pairs.map((p: KeyPair) => {
          return {
            publickey: p.publickey,
            signature: p.signature
          }
        })
        return new MultisignatureFulfillment(3, keypairs)
      default:
        throw new Error('Fulfillment is not recongnised on data')
    }
  }

  // tslint:disable-next-line
  private parseMinerPayoutsBlock (minerpayouts: any, minerpayoutcustodyfees: any, minerpayoutids: any, transactions: any): MinerPayout[] | undefined {
    if (minerpayouts && minerpayouts.length > 0) {
      return minerpayouts.map((mp: MinerPayout, index: number) => {
        let payout: MinerPayout | CustodyFeeMinerPayout

        // Compose info we already can set
        payout = {
          value: new Currency(mp.value, this.precision),
          unlockhash: mp.unlockhash,
          id: minerpayoutids[index],
          isBlockCreatorReward: false
        }

        // first element is always block creator reward
        if (index === 0) {
          payout = {
            ...payout,
            isBlockCreatorReward: true,
            description: 'Block Creator Reward (new coins)'
          }
        } else {
          const sourceTransactionIds = transactions.filter((tx: any) => tx.rawtransaction.data.minerfees)
            .map((tx: any) => tx.id)
          // add source transaction ids
          payout = {
            ...payout,
            sourceTransactionIds,
            description: 'All Transaction fees combined'
          }
        }

        if (minerpayoutcustodyfees && minerpayoutcustodyfees.length > 0) {
          // if no minerpayout on index is present just return the payout
          if (!minerpayoutcustodyfees[index]) return payout

          const custodyFeePayout: CustodyFeeMinerPayout = {
            ...payout,
            creationTime: minerpayoutcustodyfees[index].creationtime,
            isCustodyFee: minerpayoutcustodyfees[index].iscustodyfee,
            feeComputationTime: minerpayoutcustodyfees[index].feecomputationtime,
            custodyFee: new Currency(minerpayoutcustodyfees[index].custodyfee, this.precision),
            spendableValue: new Currency(minerpayoutcustodyfees[index].spendablevalue, this.precision),
            spent: minerpayoutcustodyfees[index].spent
          }
          return custodyFeePayout
        } else {
          return payout
        }
      })
    }
    return
  }
}
