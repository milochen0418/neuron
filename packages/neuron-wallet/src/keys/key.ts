import bip32 from 'bip32'
import bip39 from 'bip39'
import { Keystore } from './keystore'
import Tool from './tool'

export default class Key {
  private keystore: Keystore

  private mnemonic: string

  constructor(keystore: Keystore, mnemonic: string) {
    this.keystore = keystore
    this.mnemonic = mnemonic
  }

  public static fromKeystore = (keystore: Keystore) => {
    return new Key(keystore, '')
  }

  public static fromKeystoreString = (json: string) => {
    return new Key(JSON.parse(json), '')
  }

  getKeystore = () => this.keystore

  getKeystoreString = () => JSON.stringify(this.keystore)

  getMnemonic = () => this.mnemonic

  public static generateKey = () => {
    const mnemonic = bip39.generateMnemonic()
    return Key.fromMnemonic(mnemonic, false)
  }

  public static fromMnemonic = (mnemonic: string, derive: boolean) => {
    const seed = bip39.mnemonicToSeed(mnemonic)
    const root = bip32.fromSeed(seed)
    const master = {
      privateKey: root.privateKey.toString('hex'),
      chainCode: root.chainCode.toString('hex'),
    }
    const keystore: Keystore = {
      master,
    }
    if (derive) {
      keystore.children = Tool.searchUsedChildKeys(root)
    }
    return new Key(keystore, mnemonic)
  }
}