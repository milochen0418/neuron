import { getConnection } from 'typeorm'
import CellsService, { Cell, OutPoint, Script } from './cells'
import InputEntity from '../entities/Input'
import OutputEntity from '../entities/Output'
import TransactionEntity from '../entities/Transaction'
import { getHistoryTransactions } from '../mock_rpc'
import ckbCore from '../core'

export interface Input {
  previousOutput: OutPoint
  args: string[]
  validSince?: number
  capacity?: string | null
  lockHash?: string | null
}

export interface Witness {
  data: string[]
}

export interface Transaction {
  hash: string
  version: number
  deps?: OutPoint[]
  inputs?: Input[]
  outputs?: Cell[]
  timestamp?: string
  value?: string
  blockNumber?: string
  blockHash?: string
  witnesses?: Witness[]
  type?: string
}

export interface TransactionsByAddressesParam {
  pageNo: number
  pageSize: number
  addresses: string[]
}

export interface TransactionsByLockHashesParam {
  pageNo: number
  pageSize: number
  lockHashes: string[]
}

export interface TransactionsByPubkeysParams {
  pageNo: number
  pageSize: number
  pubkeys: string[]
}

export interface PaginationResult<T = any> {
  totalCount: number
  items: T[]
}

export interface TargetOutput {
  address: string
  capacity: string
}

/* eslint @typescript-eslint/no-unused-vars: "warn" */
export default class TransactionsService {
  public static getAll = async (params: TransactionsByLockHashesParam): Promise<PaginationResult<Transaction>> => {
    const skip = (params.pageNo - 1) * params.pageSize

    const query = getConnection()
      .getRepository(TransactionEntity)
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.inputs', 'input')
      .leftJoinAndSelect('tx.outputs', 'output')
      .where('input.lockHash in (:...lockHashes) OR output.lockHash in (:...lockHashes)', {
        lockHashes: params.lockHashes,
      })

    const totalCount: number = await query.getCount()

    const transactions: TransactionEntity[] = await query
      .skip(skip)
      .take(params.pageSize)
      .getMany()

    const txs: Transaction[] = transactions!.map(tx => {
      const outputCapacities: bigint = tx.outputs
        .filter(o => params.lockHashes.includes(o.lockHash))
        .map(o => BigInt(o.capacity))
        .reduce((result, c) => result + c, BigInt(0))
      const inputCapacities: bigint = tx.inputs
        .filter(i => {
          if (i.lockHash) {
            return params.lockHashes.includes(i.lockHash)
          }
          return false
        })
        .map(i => BigInt(i.capacity))
        .reduce((result, c) => result + c, BigInt(0))
      const value: bigint = outputCapacities - inputCapacities
      return {
        timestamp: tx.timestamp,
        value: value.toString(),
        hash: tx.hash,
        version: tx.version,
        type: value > BigInt(0) ? 'receive' : 'send',
      }
    })

    return {
      totalCount: totalCount || 0,
      items: txs,
    }
  }

  public static getAllByAddresses = async (
    params: TransactionsByAddressesParam,
  ): Promise<PaginationResult<Transaction>> => {
    const lockHashes: string[] = await Promise.all(
      params.addresses.map(async addr => {
        const lockHash: string = await TransactionsService.addressToLockHash(addr)
        return lockHash
      }),
    )

    return TransactionsService.getAll({
      pageNo: params.pageNo,
      pageSize: params.pageSize,
      lockHashes,
    })
  }

  public static getAllByPubkeys = async (
    params: TransactionsByPubkeysParams,
  ): Promise<PaginationResult<Transaction>> => {
    const lockHashes: string[] = await Promise.all(
      params.pubkeys.map(async pubkey => {
        const addr = ckbCore.utils.pubkeyToAddress(pubkey)
        const lockHash = await TransactionsService.addressToLockHash(addr)
        return lockHash
      }),
    )

    return TransactionsService.getAll({
      pageNo: params.pageNo,
      pageSize: params.pageSize,
      lockHashes,
    })
  }

  public static get = async (hash: string): Promise<Transaction | undefined> => {
    const tx = await getConnection()
      .getRepository(TransactionEntity)
      .findOne(hash, { relations: ['inputs', 'outputs'] })

    if (!tx) {
      return undefined
    }

    const transaction: Transaction = {
      ...tx,
      inputs: tx.inputs.map(i => {
        return {
          ...i,
          previousOutput: i.previousOutput(),
        }
      }),
      outputs: tx.outputs.map(o => {
        return {
          ...o,
          outPoint: o.outPoint(),
        }
      }),
    }

    return transaction
  }

  // check whether the address has history transactions
  public static hasTransactions = async (address: string): Promise<boolean> => {
    const blake160 = ckbCore.utils.parseAddress(address, ckbCore.utils.AddressPrefix.Testnet, 'hex') as string
    const contractInfo = await TransactionsService.contractInfo()

    const lock: Script = {
      binaryHash: contractInfo.binaryHash,
      args: [blake160],
    }
    const lockHash: string = TransactionsService.lockScriptToHash(lock)

    const output: OutputEntity | undefined = await getConnection()
      .getRepository(OutputEntity)
      .findOne({
        where: { lockHash },
      })

    if (output) {
      return true
    }
    return false
  }

  public static create = async (transaction: Transaction): Promise<TransactionEntity> => {
    const tx = new TransactionEntity()
    tx.hash = transaction.hash
    tx.version = transaction.version
    tx.deps = transaction.deps!
    tx.timestamp = transaction.timestamp!
    tx.blockHash = transaction.blockHash!
    tx.blockNumber = transaction.blockNumber!
    tx.witnesses = transaction.witnesses!
    tx.inputs = []
    tx.outputs = []
    await getConnection().manager.save(tx)
    await transaction.inputs!.forEach(async i => {
      const input = new InputEntity()
      input.outPointHash = i.previousOutput.hash
      input.outPointIndex = i.previousOutput.index
      input.args = i.args
      input.transaction = tx
      input.capacity = i.capacity || null
      input.lockHash = i.lockHash || null
      await getConnection().manager.save(input)
    })
    await transaction.outputs!.forEach(async (o, index) => {
      const output = new OutputEntity()
      output.outPointHash = transaction.hash
      output.outPointIndex = index
      output.capacity = o.capacity
      output.data = o.data!
      output.lock = o.lock
      output.type = o.type!
      output.lockHash = o.lockHash!
      output.transaction = tx
      output.status = 'live'
      await getConnection().manager.save(output)
    })

    return tx
  }

  /* eslint no-await-in-loop: "warn" */
  // NO parallel
  public static loadTransactionsHistoryFromChain = async (lockHashes: string[]) => {
    // TODO: to => get_tip_block_number
    const to = 1000
    let currentFrom = 0
    let currentTo = to
    while (currentFrom <= to) {
      currentTo = Math.min(currentFrom + 100, to)
      const txs = await getHistoryTransactions(lockHashes, currentFrom.toString(), currentTo.toString())
      await TransactionsService.convertTransactions(txs)
      currentFrom = currentTo + 1
    }
  }

  public static convertTransactions = async (transactions: Transaction[]): Promise<TransactionEntity[]> => {
    const txEntities: TransactionEntity[] = []

    transactions.forEach(async tx => {
      const txEntity = await TransactionsService.convertTransactionAndCreate(tx)
      txEntities.push(txEntity)
    })

    return txEntities
  }

  // update previousOutput's status to 'dead' if found
  public static convertTransactionAndCreate = async (transaction: Transaction): Promise<TransactionEntity> => {
    const tx: Transaction = transaction
    tx.outputs = tx.outputs!.map(o => {
      const output = o
      output.lockHash = TransactionsService.lockScriptToHash(output.lock!)
      return output
    })

    tx.inputs = await Promise.all(
      tx.inputs!.map(async i => {
        const input: Input = i
        const outputEntity: OutputEntity | undefined = await getConnection()
          .getRepository(OutputEntity)
          .findOne({
            outPointHash: i.previousOutput.hash,
            outPointIndex: i.previousOutput.index,
          })
        if (outputEntity) {
          input.capacity = outputEntity.capacity
          input.lockHash = outputEntity.lockHash
          // update status to 'dead' if found in input
          outputEntity.status = 'dead'
          await getConnection().manager.save(outputEntity)
        }
        return input
      }),
    )
    const txEntity = await TransactionsService.create(transaction)
    return txEntity
  }

  // system contract info
  public static contractInfo = async () => {
    const genesisHash: string = await ckbCore.rpc.getBlockHash(0)
    const genesisBlock = await ckbCore.rpc.getBlock(genesisHash)
    const systemScriptTx = genesisBlock.commitTransactions[0]
    const blake2b = ckbCore.utils.blake2b(32)
    // TODO: update data type when update SDK
    const systemScriptCell = systemScriptTx.outputs[0]
    blake2b.update(systemScriptCell.data)
    const binaryHash: string = blake2b.digest('hex')
    const outPoint: OutPoint = {
      hash: systemScriptTx.hash,
      index: 0,
    }
    return {
      binaryHash,
      outPoint,
    }
  }

  // lockHashes for each inputs
  public static generateTx = async (lockHashes: string[], targetOutputs: TargetOutput[], changeAddress: string) => {
    const { binaryHash, outPoint } = await TransactionsService.contractInfo()

    const needCapacities: bigint = targetOutputs
      .map(o => BigInt(o.capacity))
      .reduce((result, c) => result + c, BigInt(0))

    const { inputs, capacities } = await CellsService.gatherInputs(needCapacities.toString(), lockHashes)

    const outputs: Cell[] = targetOutputs.map(o => {
      const { capacity, address } = o

      const blake160: string = ckbCore.utils.parseAddress(address, ckbCore.utils.AddressPrefix.Testnet, 'hex') as string

      const output: Cell = {
        capacity,
        data: '0x',
        lock: {
          binaryHash,
          args: [blake160],
        },
      }

      return output
    })

    // change
    if (BigInt(capacities) > needCapacities) {
      const changeBlake160: string = ckbCore.utils.parseAddress(
        changeAddress,
        ckbCore.utils.AddressPrefix.Testnet,
        'hex',
      ) as string

      const output: Cell = {
        capacity: `${BigInt(capacities) - needCapacities}`,
        data: '0x',
        lock: {
          binaryHash,
          args: [changeBlake160],
        },
      }

      outputs.push(output)
    }

    return {
      version: 0,
      deps: [outPoint],
      inputs,
      outputs,
    }
  }

  // use SDK lockScriptToHash
  public static lockScriptToHash = (lock: Script) => {
    const binaryHash: string = lock!.binaryHash!
    const args: Uint8Array[] = lock.args!.map(n => {
      return ckbCore.utils.hexToBytes(n)
    })
    return ckbCore.utils.lockScriptToHash({
      binaryHash,
      args,
    })
  }

  public static addressToLockScript = async (address: string): Promise<Script> => {
    const blake160: string = ckbCore.utils.parseAddress(address, ckbCore.utils.AddressPrefix.Testnet, 'hex') as string
    const contractInfo = await TransactionsService.contractInfo()

    const lock: Script = {
      binaryHash: contractInfo.binaryHash,
      args: [blake160],
    }
    return lock
  }

  public static addressToLockHash = async (address: string): Promise<string> => {
    const lock: Script = await TransactionsService.addressToLockScript(address)
    const lockHash: string = await TransactionsService.lockScriptToHash(lock)

    return lockHash
  }
}
