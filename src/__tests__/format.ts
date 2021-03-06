import { Parser } from '../parser'
import { transactionIdJSON, blockidJSON, unlockhash, unlockhashBlockCreator,
  coinoutputIdJSON, unspentCoinoutputIdJSON, unspentCoinOutputIDBlockCreatorJSON,
  spentCoinOutputIdBlockCreatorJSON, unspentBlockStakeOutputIdJSON, blockResponseJSON,
  spentAtomicSwapCoinOutputId, coinCreationTransactionJSON, minterDefinitionTransactionJSON,
  atomicSwapContract, blockWithCustodyFee, transactionWithCustodyFees, walletWithCustodyFees,
  custodyVoidAddress
} from '../testdata/data'
import { Block, Wallet, ResponseType, CoinOutputInfo, BlockstakeOutputInfo } from '../types'
import { first } from 'lodash'
import { SingleSignatureFulfillment, FulfillmentType } from '../fulfillmentTypes'
import { ConditionType, AtomicSwapCondition } from '../conditionTypes'
import { DefaultTransaction, MinterDefinitionTransaction, CoinCreationTransaction } from '../transactionTypes'

test('test parsing block', () => {
  const hash = '2c8cc0b42b6232dcab8d27472781cfecfcab9fcae36d776672244016b69cead5'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(blockidJSON, hash) as Block

  expect(parsedResponse instanceof Block)
  expect(parsedResponse.kind()).toBe(ResponseType.Block)

  const expectedBlockId = '2c8cc0b42b6232dcab8d27472781cfecfcab9fcae36d776672244016b69cead5'

  expect(parsedResponse.id).toBe(expectedBlockId)
  expect(parsedResponse.height).toBe(367184)
  expect(parsedResponse.timestamp).toBe(1568963542)

  expect(parsedResponse.transactions.length).toBe(3)

  const firstTx = first(parsedResponse.transactions)
  expect(firstTx instanceof DefaultTransaction)
  if (firstTx) {
    expect(firstTx.blockId).toBe(expectedBlockId)
  }

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing transaction', () => {
  const hash = 'a759d010ec638cef7f06565f04f4d7c06d66ca4e02aa342ecce001d95135087e'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(transactionIdJSON, hash) as DefaultTransaction

  expect(parsedResponse instanceof DefaultTransaction)
  expect(parsedResponse.kind()).toBe(ResponseType.Transaction)

  expect(parsedResponse.id).toBe('a759d010ec638cef7f06565f04f4d7c06d66ca4e02aa342ecce001d95135087e')
  expect(parsedResponse.unconfirmed).toBe(false)
  expect(parsedResponse.version).toBe(1)

  if (parsedResponse.blockStakeInputs) {
    expect(parsedResponse.blockStakeInputs.length).toBe(1)
    const firstBsInput = first(parsedResponse.blockStakeInputs)
    if (firstBsInput) {
      expect(firstBsInput.parentid).toBe('90fa5e4456ebaefc77e9e2852199e1003dced4bac65e6e2e08b70690f97013d0')
      expect(firstBsInput instanceof SingleSignatureFulfillment)
      expect(firstBsInput.fulfillment.getFulfillmentType()).toBe(FulfillmentType.SingleSignatureFulfillment)

      const singleSigFulfillment = firstBsInput.fulfillment as SingleSignatureFulfillment
      expect(singleSigFulfillment.publicKey).toBe('ed25519:b76697f1517455d0fa41fe57c2b54c80cbdd9761393f7e545db747482eb2727b')
    }
  }

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing unlockhash', () => {
  const hash = '0130241fe6fa22f547e9cf2e268af55d117bfe5fbb02894eec42b906a5a9c41ad69d91e6776af1'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(unlockhash, hash) as Wallet

  expect(parsedResponse instanceof Wallet)

  expect(parsedResponse.isBlockCreator).toBe(false)
  expect(parsedResponse.address).toBe('0130241fe6fa22f547e9cf2e268af55d117bfe5fbb02894eec42b906a5a9c41ad69d91e6776af1')
  expect(parsedResponse.confirmedCoinBalance.toString()).toBe('900')
  expect(parsedResponse.confirmedBlockstakeBalance.toString()).toBe('0')

  if (parsedResponse.coinOutputs) {
    expect(parsedResponse.coinOutputs.length).toBe(3)
  }
  if (parsedResponse.transactions) {
    expect(parsedResponse.transactions.length).toBe(3)
  }

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing unlockhash blockcreator', () => {
  const hash = '015a080a9259b9d4aaa550e2156f49b1a79a64c7ea463d810d4493e8242e6791584fbdac553e6f'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(unlockhashBlockCreator, hash) as Wallet

  expect(parsedResponse instanceof Wallet)

  expect(parsedResponse.isBlockCreator).toBe(true)
  expect(parsedResponse.address).toBe('015a080a9259b9d4aaa550e2156f49b1a79a64c7ea463d810d4493e8242e6791584fbdac553e6f')
  expect(parsedResponse.confirmedCoinBalance.toString()).toBe('100000070')
  expect(parsedResponse.confirmedBlockstakeBalance.toString()).toBe('3000')

  if (parsedResponse.minerPayouts) {
    expect(parsedResponse.minerPayouts.length).toBe(7)
  }
  if (parsedResponse.coinOutputsBlockCreator) {
    expect(parsedResponse.coinOutputsBlockCreator.length).toBe(1)
  }
  if (parsedResponse.blockStakesOutputsBlockCreator) {
    expect(parsedResponse.blockStakesOutputsBlockCreator.length).toBe(8)
  }

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing a spent coin output id', () => {
  const hash = '6321aecd61aa7ae6d37e611a9e3d3eba898b752789df2b559dcca5b11429ca4b'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(coinoutputIdJSON, hash) as CoinOutputInfo

  expect(parsedResponse instanceof CoinOutputInfo)
  expect(parsedResponse.output).toBeTruthy()
  expect(parsedResponse.input).toBeTruthy()

  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing an unspent coin output id', () => {
  const hash = 'a428df56e77c40621333f2923f27e885702f1ba9a3dc52f41e97c0a4784fea64'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(unspentCoinoutputIdJSON, hash)

  expect(parsedResponse instanceof CoinOutputInfo)
  expect(parsedResponse.output).toBeTruthy()

  // Since its unspent, no input will be found
  expect(parsedResponse.input).toBeUndefined()

  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing a spent coin output id for blockcreator', () => {
  const hash = '3559a1efb6b2f14edd1c885d61068979e56dc66cd8861d98a9ba77e54453d434'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(spentCoinOutputIdBlockCreatorJSON, hash) as CoinOutputInfo

  expect(parsedResponse instanceof CoinOutputInfo)
  expect(parsedResponse.output).toBeTruthy()
  expect(parsedResponse.input).toBeTruthy()

  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing an unspent coin output id for blockcreator', () => {
  const hash = 'f0bf7ede4bb6c38cf3199b8a1c3501ed48346bd926bf5bfe6c3a2dcadcfa4af9'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(unspentCoinOutputIDBlockCreatorJSON, hash) as CoinOutputInfo

  expect(parsedResponse instanceof CoinOutputInfo)
  expect(parsedResponse.output).toBeTruthy()
  expect(parsedResponse.output.isBlockCreatorReward).toBe(true)
  expect(parsedResponse.output.blockId).toBeTruthy()

  // Since its unspent, no input will be found
  expect(parsedResponse.input).toBeUndefined()

  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing a spent atomic swap coin output id', () => {
  const hash = '19c162756112c6d950593c8d740999d976a9743390415ee870104f336551d73c'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(spentAtomicSwapCoinOutputId, hash) as CoinOutputInfo

  expect(parsedResponse instanceof CoinOutputInfo)
  expect(parsedResponse.output).toBeTruthy()
  if (parsedResponse.output.condition) {
    expect(parsedResponse.output.condition.getConditionType()).toBe(ConditionType.AtomicSwapCondition)
  }
  expect(parsedResponse.input).toBeTruthy()

  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing an spent blockstake output id', () => {
  const hash = '603222de3b3e729950d6eccd9dfc4882e64cc48cb1147aa51f158afc6ddc9b1b'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(unspentBlockStakeOutputIdJSON, hash) as BlockstakeOutputInfo

  expect(parsedResponse instanceof BlockstakeOutputInfo)
  expect(parsedResponse.output).toBeTruthy()

  // // Since its unspent, no input will be found
  expect(parsedResponse.input).toBeTruthy()

  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing block from block response', () => {
  const parser = new Parser()
  const parsedResponse = parser.ParseBlockResponseJSON(blockResponseJSON)

  expect(parsedResponse instanceof Block)
  expect(parsedResponse.kind()).toBe(ResponseType.Block)

  const expectedBlockId = '1220b86ae316865d6efe51211256041a9636984e74400dc5ab90700fdad6c179'

  expect(parsedResponse.id).toBe(expectedBlockId)
  expect(parsedResponse.height).toBe(371498)
  expect(parsedResponse.timestamp).toBe(1569481927)

  expect(parsedResponse.transactions.length).toBe(1)

  const firstTx = first(parsedResponse.transactions)
  expect(firstTx instanceof DefaultTransaction)
  if (firstTx) {
    expect(firstTx.blockId).toBe(expectedBlockId)
  }

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing a minting transaction', () => {
  const hash = '88fa9fa6f27693c11805c4a7d9272d7c3b299f0707aca7a887af24c002245b7e'
  const parser = new Parser()
  const parsedResponse
    = parser.ParseHashResponseJSON(minterDefinitionTransactionJSON, hash) as MinterDefinitionTransaction

  expect(parsedResponse instanceof MinterDefinitionTransaction)
  expect(parsedResponse.kind()).toBe(ResponseType.Transaction)

  expect(parsedResponse.id).toBe('88fa9fa6f27693c11805c4a7d9272d7c3b299f0707aca7a887af24c002245b7e')
  expect(parsedResponse.unconfirmed).toBe(false)

  expect(parsedResponse.minterDefinitionCondition).toBeTruthy()
  expect(parsedResponse.minterDefinitionFulfillment).toBeTruthy()

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing a minting transaction', () => {
  const hash = '589236cc9d800884d1270b627c3b4d3da9e12e330c763f20d4e4dd841730810b'
  const parser = new Parser()
  const parsedResponse
    = parser.ParseHashResponseJSON(coinCreationTransactionJSON, hash) as CoinCreationTransaction

  expect(parsedResponse instanceof CoinCreationTransaction)
  expect(parsedResponse.kind()).toBe(ResponseType.Transaction)

  expect(parsedResponse.id).toBe(hash)
  expect(parsedResponse.unconfirmed).toBe(false)

  expect(parsedResponse.coinCreationFulfillment).toBeTruthy()
  expect(parsedResponse.coinCreationOutputs).toBeTruthy()

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing an atomic swap contract address', () => {
  const hash = '02ed044fa056e6fda24261628576d61f7ed580a649496a582ac0691f90f4ef89002a1a5f368c57'
  const parser = new Parser()
  const parsedResponse
    = parser.ParseHashResponseJSON(atomicSwapContract, hash) as Wallet

  expect(parsedResponse.kind()).toBe(ResponseType.Wallet)

  expect(parsedResponse.address).toBe(hash)

  if (parsedResponse.coinOutputs) {
    expect(parsedResponse.coinOutputs.length).toBe(1)
    expect(parsedResponse.coinOutputs[0].condition instanceof AtomicSwapCondition)
  }

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing block with custody fee', () => {
  const parser = new Parser()
  const parsedResponse = parser.ParseBlockResponseJSON(blockWithCustodyFee)

  expect(parsedResponse instanceof Block)
  expect(parsedResponse.kind()).toBe(ResponseType.Block)

  const expectedBlockId = 'bf52c9124b07b3fc3cbe7113dc377226b5caad902a6312624587e7748f6ffb09'

  expect(parsedResponse.id).toBe(expectedBlockId)
  expect(parsedResponse.height).toBe(76)
  expect(parsedResponse.timestamp).toBe(1570720622)

  expect(parsedResponse.transactions.length).toBe(2)

  const firstTx = first(parsedResponse.transactions)
  expect(firstTx instanceof DefaultTransaction)
  if (firstTx) {
    expect(firstTx.blockId).toBe(expectedBlockId)
  }

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing transaction with custody fees', () => {
  const hash = 'a7af3a6e827a735f5a0dac599b155f2fa8296dc87ad7c605ed4fbc43563325bf'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(transactionWithCustodyFees, hash) as DefaultTransaction

  expect(parsedResponse instanceof DefaultTransaction)
  expect(parsedResponse.kind()).toBe(ResponseType.Transaction)

  expect(parsedResponse.id).toBe('a7af3a6e827a735f5a0dac599b155f2fa8296dc87ad7c605ed4fbc43563325bf')
  expect(parsedResponse.unconfirmed).toBe(false)
  expect(parsedResponse.version).toBe(1)

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})

test('test parsing unlockhash with custody fees', () => {
  const hash = '0178c06a59eca06ca656c400cfc5960da128162a8aa122a41b1051bff93d4c10c17b024cc8af88'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(walletWithCustodyFees, hash) as Wallet

  expect(parsedResponse instanceof Wallet)

  expect(parsedResponse.isBlockCreator).toBe(false)
  expect(parsedResponse.address).toBe(hash)

  // Check if everything else is correct
  // expect(parsedResponse).toMatchSnapshot()
})

test('test parsing custody void address', () => {
  const hash = '800000000000000000000000000000000000000000000000000000000000000000af7bedde1fea'
  const parser = new Parser()
  const parsedResponse = parser.ParseHashResponseJSON(custodyVoidAddress, hash) as Wallet

  expect(parsedResponse instanceof Wallet)

  expect(parsedResponse.isCustodyVoid).toBe(true)

  expect(parsedResponse.address).toBe(hash)

  // Check if everything else is correct
  expect(parsedResponse).toMatchSnapshot()
})
