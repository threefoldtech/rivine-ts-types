import { Currency } from './types'

export enum ConditionType {
  NilCondition,
  UnlockhashCondition,
  AtomicSwapCondition,
  TimelockCondition,
  MultisignatureCondition,
  CustodyFeeCondition = 128
}

export abstract class Condition {
  public type: number
  public id?: string

  constructor (type: number) {
    this.type = type
  }

  public kind (): number {
    return this.type
  }

  public abstract getConditionType (): ConditionType
}

export class NilCondition extends Condition {
  constructor (type: number) {
    super(type)
  }

  public getConditionType (): ConditionType {
    return ConditionType.NilCondition
  }
}

export class UnlockhashCondition extends Condition {
  public unlockhash: string

  constructor (type: number, unlockhash: string) {
    super(type)
    this.unlockhash = unlockhash
  }

  public getConditionType (): ConditionType {
    return ConditionType.UnlockhashCondition
  }
}

export class AtomicSwapCondition extends Condition {
  public sender: string
  public receiver: string
  public contractAddress: string
  public hashedSecret: string
  public timelock: number

  constructor
  (type: number, sender: string, receiver: string, contractAddress: string, hashedsecret: string, timelock: number) {
    super(type)
    this.sender = sender
    this.receiver = receiver
    this.contractAddress = contractAddress
    this.hashedSecret = hashedsecret
    this.timelock = timelock
  }

  public getConditionType (): ConditionType {
    return ConditionType.AtomicSwapCondition
  }
}

export class TimelockCondition extends Condition {
  public locktime: number
  public condition: UnlockhashCondition | MultisignatureCondition | NilCondition

  constructor
  (type: number, locktime: number, condition: UnlockhashCondition | MultisignatureCondition | NilCondition) {
    super(type)
    this.locktime = locktime
    this.condition = condition
  }

  public getConditionType (): ConditionType {
    return ConditionType.TimelockCondition
  }
}

export class MultisignatureCondition extends Condition {
  public unlockhashes: string[]
  public signatureCount: number
  public multisigAddress: string

  constructor (type: number, unlockhashes: string[], signatureCount: number, multisigAddress: string) {
    super(type)
    this.unlockhashes = unlockhashes
    this.signatureCount = signatureCount
    this.multisigAddress = multisigAddress
  }

  public getConditionType (): number {
    return ConditionType.MultisignatureCondition
  }
}

export class CustodyFeeCondition extends Condition {
  public custodyFeeVoidAddress: string

  constructor (type: number, custodyFeeVoidAddress: string) {
    super(type)
    this.custodyFeeVoidAddress = custodyFeeVoidAddress
  }

  public getConditionType (): number {
    return ConditionType.CustodyFeeCondition
  }
}
