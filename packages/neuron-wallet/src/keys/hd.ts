import bip32, { BIP32 } from 'bip32'
import { Child, KeysData } from './keystore'
import Address from './address'

enum BIP44Params {
  Purpose = "44'",
  // 360 is tentative value
  CoinTypeTestnet = "360'",
  Account = "0'",
}

enum AddressType {
  Receive = 0,
  Change = 1,
}

const MaxAddressNumber = 20

const HD = {
  generateReceiveAndChangeAddresses: (
    keysData: KeysData,
    receiveAddressNumber: number,
    changeAddressNumber: number,
  ) => {
    if (receiveAddressNumber < 1 || changeAddressNumber < 1) {
      throw new Error('Address number error.')
    } else if (receiveAddressNumber > MaxAddressNumber || changeAddressNumber > MaxAddressNumber) {
      throw new Error('Address number error.')
    }
    const receiveAddresses = []
    const changeAddresses = []
    const root: BIP32 = bip32.fromPrivateKey(
      Buffer.from(keysData.privateKey, 'hex'),
      Buffer.from(keysData.chainCode, 'hex'),
    )
    for (let index = 0; index < receiveAddressNumber; index++) {
      receiveAddresses.push(HD.addressFromHDIndex(root, index, AddressType.Receive))
    }
    for (let index = 0; index < changeAddressNumber; index++) {
      changeAddresses.push(HD.addressFromHDIndex(root, index, AddressType.Change))
    }
    return {
      receive: receiveAddresses,
      change: changeAddresses,
    }
  },

  latestUnusedAddress: (keysData: KeysData) => {
    const root: BIP32 = bip32.fromPrivateKey(
      Buffer.from(keysData.privateKey, 'hex'),
      Buffer.from(keysData.chainCode, 'hex'),
    )
    const latestUnusedIndex = HD.searchAddress(root, 20)
    return HD.addressFromHDIndex(root, latestUnusedIndex)
  },

  searchUsedChildKeys: (root: BIP32) => {
    const children: Child[] = []
    const nextUnusedIndex = HD.searchAddress(root, 20)
    for (let index = 0; index < nextUnusedIndex; index++) {
      const path = HD.path(AddressType.Receive, index)
      const { privateKey, chainCode } = root.derivePath(path)
      if (Address.isUsedAddress(Address.addressFromPrivateKey(privateKey.toString('hex')))) {
        children.push({
          path,
          privateKey: privateKey.toString('hex'),
          chainCode: chainCode.toString('hex'),
        })
      }
    }
    return children
  },

  path: (type: AddressType, index: number) => {
    return `m/${BIP44Params.Purpose}/${BIP44Params.CoinTypeTestnet}/${BIP44Params.Account}/${type}/${index}`
  },

  addressFromHDIndex: (root: BIP32, index: number, type = AddressType.Receive) => {
    const path = HD.path(type, index)
    const { privateKey } = root.derivePath(path)
    return Address.addressFromPrivateKey(privateKey.toString('hex'))
  },

  // TODO: refactor me
  searchAddress: (root: BIP32, index: number, maxUsedIndex = 0, minUnusedIndex = 100, depth = 0): any => {
    if (depth >= 10) return maxUsedIndex + 1
    if (!Address.isUsedAddress(HD.addressFromHDIndex(root, AddressType.Receive, index))) {
      if (index === 0) {
        return 0
      }
      return HD.searchAddress(
        root,
        Math.floor((index - maxUsedIndex) / 2 + maxUsedIndex),
        maxUsedIndex,
        Math.min(minUnusedIndex, index),
        depth + 1,
      )
    }
    if (!Address.isUsedAddress(HD.addressFromHDIndex(root, index + 1))) {
      return index + 1
    }
    return HD.searchAddress(
      root,
      Math.round((minUnusedIndex - index) / 2 + index),
      Math.max(maxUsedIndex, index),
      minUnusedIndex,
      depth + 1,
    )
  },
}

export default HD