import WalletChannel from '../channel/wallet'
import WalletsService, { Wallet } from '../services/wallets'
import { verifyPassword } from '../utils/validators'
import { Response, ResponseCode } from '.'
import asw from '../wallets/asw'
import windowManage from '../main'
import { Channel } from '../utils/const'

const activeWallet = asw

export enum WalletsMethod {
  Index = 'index',
  Create = 'create',
  Import = 'import',
  Update = 'update',
  Delete = 'delete',
  Active = 'active',
  SetActive = 'setActive',
}

class WalletsController {
  public channel: WalletChannel

  static service = new WalletsService()

  constructor(channel: WalletChannel) {
    this.channel = channel
  }

  public static index = (): Response<Wallet[]> => {
    const wallets = WalletsController.service.index()
    if (wallets) {
      return {
        status: ResponseCode.Success,
        result: wallets,
      }
    }
    return {
      status: ResponseCode.Fail,
      msg: 'Wallets not found',
    }
  }

  public static show = (id: string): Response<Wallet> => {
    const wallet = WalletsController.service.show(id)
    if (wallet) {
      return {
        status: ResponseCode.Success,
        result: wallet,
      }
    }
    return {
      status: ResponseCode.Fail,
      msg: 'Wallet not found',
    }
  }

  public static create = ({
    name,
    address,
    publicKey,
    password,
  }: {
    name: string
    address: string
    publicKey: Uint8Array
    password: string
  }): Response<Wallet> => {
    const wallet = WalletsController.service.create(
      {
        name,
        address,
        publicKey,
      },
      password,
    )
    if (wallet) {
      return {
        status: ResponseCode.Success,
        result: wallet,
      }
    }
    return {
      status: ResponseCode.Fail,
      msg: 'Failed to create wallet',
    }
  }

  // TODO: import wallet
  // public static import = ({
  //   name,
  //   password,
  //   mnemonic,
  //   keystore,
  // }: {
  //   name: string
  //   password: string
  //   mnemonic: string
  //   keystore: string
  // }): Response<boolean> => {
  //   // generate wallet for service
  //   const walletStore = new WalletStore()
  //   let storedKeystore
  //   if (mnemonic) {
  //     storedKeystore = Key.fromMnemonic(mnemonic, true, password).getKeystore()
  //   } else if (keystore) {
  //     storedKeystore = Key.fromKeystoreString(keystore, password).getKeystore()
  //   }
  //   if (storedKeystore) {
  //     walletStore.saveWallet(name, storedKeystore)
  //     return {
  //       status: ResponseCode.Success,
  //       result: true,
  //     }
  //   }
  //   return {
  //     status: ResponseCode.Fail,
  //     msg: 'Failed to import wallet',
  //   }
  // }

  // TODO: implement service.update
  // public static update = ({
  //   id,
  //   name,
  //   address,
  //   publicKey,
  //   password,
  // }: {
  //   id: string
  //   name?: string
  //   address?: string
  //   publicKey?: Uint8Array
  //   password: string
  // }): Response<boolean> => {
  //   const wallet = WalletsController.service.show(id)
  //   const isPermitted = verifyPassword(wallet, password)
  //   if (!isPermitted) {
  //     return {
  //       status: ResponseCode.Fail,
  //       msg: 'Incorrect password',
  //     }
  //   }
  //   const success = WalletsController.service.update({
  //     id,
  //     name,
  //     address,
  //     publicKey,
  //   })
  //   if (success) {
  //     windowManage.broadcast(Channel.Wallets, WalletsMethod.Index, WalletsController.index())
  //     return {
  //       status: ResponseCode.Success,
  //       result: true,
  //     }
  //   }
  //   return {
  //     status: ResponseCode.Fail,
  //     msg: 'Failed to update wallet',
  //   }
  // }

  public static delete = ({ id, password }: { id: string; password: string }): Response<boolean> => {
    const wallet = WalletsController.service.show(id)
    const isPermitted = verifyPassword(wallet, password)
    if (!isPermitted) {
      return {
        status: ResponseCode.Fail,
        msg: 'Incorrect password',
      }
    }
    const success = WalletsController.service.delete(id)
    if (success) {
      // TODO: details, what to do when active wallet deleted
      windowManage.broadcast(Channel.Wallets, WalletsMethod.Index, WalletsController.index())
      return {
        status: ResponseCode.Success,
        result: true,
      }
    }
    return {
      status: ResponseCode.Fail,
      msg: 'Failed to delete wallet',
    }
  }

  public static active = () => {
    if (activeWallet) {
      return {
        status: ResponseCode.Success,
        result: {
          name: 'active wallet',
          address: activeWallet.address,
          publicKey: activeWallet.publicKey,
        },
      }
    }
    return {
      status: ResponseCode.Fail,
      msg: 'No active wallet',
    }
  }

  public static setActive = (id: string) => {
    const success = WalletsController.service.setActive(id)
    if (success) {
      return {
        status: ResponseCode.Success,
        result: WalletsController.service.active,
      }
    }
    return {
      status: ResponseCode.Fail,
      msg: 'Failed to activate wallet',
    }
    // TODO: verification
  }
}

export default WalletsController