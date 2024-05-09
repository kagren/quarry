import type { ProgramAccount } from "@project-serum/anchor";
import type {
  AugmentedProvider,
  TransactionEnvelope,
} from "@saberhq/solana-contrib";
import type { Token, TokenAmount, u64 } from "@saberhq/token-utils";
import {
  createInitMintInstructions,
  getOrCreateATA,
  TOKEN_PROGRAM_ID,
} from "@saberhq/token-utils";
import type { AccountInfo, Signer } from "@solana/web3.js";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";

import type {
  MinterData,
  MintWrapperData,
  MintWrapperProgram,
} from "../../programs/mintWrapper";
import type { QuarrySDK } from "../../sdk";
import { findMinterAddress, findMintWrapperAddress } from "./pda";
import type { PendingMintAndWrapper, PendingMintWrapper } from "./types";

export class MintWrapper {
  readonly program: MintWrapperProgram;

  constructor(readonly sdk: QuarrySDK) {
    this.program = sdk.programs.MintWrapper;
  }

  get provider(): AugmentedProvider {
    return this.sdk.provider;
  }

  async newWrapperAndMintV1({
    mintKP = Keypair.generate(),
    decimals = 6,
    ...newWrapperArgs
  }: {
    mintKP?: Signer;
    decimals?: number;

    hardcap: u64;
    baseKP?: Signer;
    tokenProgram?: PublicKey;
    admin?: PublicKey;
    payer?: PublicKey;
  }): Promise<PendingMintAndWrapper> {
    const provider = this.provider;
    const { mintWrapper, tx: initMintProxyTX } = await this.newWrapperV1({
      ...newWrapperArgs,
      tokenMint: mintKP.publicKey,
    });
    const initMintTX = await createInitMintInstructions({
      provider,
      mintAuthority: mintWrapper,
      freezeAuthority: mintWrapper,
      mintKP,
      decimals,
    });
    return {
      mintWrapper,
      mint: mintKP.publicKey,
      tx: initMintTX.combine(initMintProxyTX),
    };
  }

  async newWrapperV1({
    hardcap,
    tokenMint,
    baseKP = Keypair.generate(),
    tokenProgram = TOKEN_PROGRAM_ID,
    admin = this.provider.wallet.publicKey,
    payer = this.provider.wallet.publicKey,
  }: {
    hardcap: u64;
    tokenMint: PublicKey;
    baseKP?: Signer;
    tokenProgram?: PublicKey;
    admin?: PublicKey;
    payer?: PublicKey;
  }): Promise<PendingMintWrapper> {
    const [mintWrapper, bump] = await findMintWrapperAddress(
      baseKP.publicKey,
      this.program.programId
    );
    return {
      mintWrapper,
      tx: this.provider.newTX(
        [
          this.program.instruction.newWrapper(bump, hardcap, {
            accounts: {
              base: baseKP.publicKey,
              mintWrapper,
              admin,
              tokenMint,
              tokenProgram,
              payer,
              systemProgram: SystemProgram.programId,
            },
          }),
        ],
        [baseKP]
      ),
    };
  }

  async newWrapper({
    hardcap,
    tokenMint,
    baseKP = Keypair.generate(),
    tokenProgram = TOKEN_PROGRAM_ID,
    admin = this.provider.wallet.publicKey,
    payer = this.provider.wallet.publicKey,
  }: {
    hardcap: u64;
    tokenMint: PublicKey;
    baseKP?: Signer;
    tokenProgram?: PublicKey;
    admin?: PublicKey;
    payer?: PublicKey;
  }): Promise<PendingMintWrapper> {
    const [mintWrapper] = await findMintWrapperAddress(
      baseKP.publicKey,
      this.program.programId
    );
    return {
      mintWrapper,
      tx: this.provider.newTX(
        [
          this.program.instruction.newWrapperV2(hardcap, {
            accounts: {
              base: baseKP.publicKey,
              mintWrapper,
              admin,
              tokenMint,
              tokenProgram,
              payer,
              systemProgram: SystemProgram.programId,
            },
          }),
        ],
        [baseKP]
      ),
    };
  }

  async newWrapperAndMint({
    mintKP = Keypair.generate(),
    decimals = 6,
    ...newWrapperArgs
  }: {
    mintKP?: Signer;
    decimals?: number;

    hardcap: u64;
    baseKP?: Signer;
    tokenProgram?: PublicKey;
    admin?: PublicKey;
    payer?: PublicKey;
  }): Promise<PendingMintAndWrapper> {
    const provider = this.provider;
    const { mintWrapper, tx: initMintProxyTX } = await this.newWrapper({
      ...newWrapperArgs,
      tokenMint: mintKP.publicKey,
    });
    const initMintTX = await createInitMintInstructions({
      provider,
      mintAuthority: mintWrapper,
      freezeAuthority: mintWrapper,
      mintKP,
      decimals,
    });
    return {
      mintWrapper,
      mint: mintKP.publicKey,
      tx: initMintTX.combine(initMintProxyTX),
    };
  }

  /**
   * Fetches info on a Mint Wrapper.
   * @param minter
   * @returns
   */
  async fetchMintWrapper(wrapper: PublicKey): Promise<MintWrapperData | null> {
    const accountInfo = await this.provider.connection.getAccountInfo(wrapper);
    if (!accountInfo) {
      return null;
    }
    return this.program.coder.accounts.decode<MintWrapperData>(
      "MintWrapper",
      accountInfo.data
    );
  }

  /**
   * Fetches info on a minter.
   * @param minter
   * @returns
   */
  async fetchMinter(
    wrapper: PublicKey,
    authority: PublicKey
  ): Promise<MinterData | null> {
    const [minterAddress] = await findMinterAddress(
      wrapper,
      authority,
      this.program.programId
    );
    const accountInfo = await this.provider.connection.getAccountInfo(
      minterAddress
    );
    if (!accountInfo) {
      return null;
    }
    return this.program.coder.accounts.decode<MinterData>(
      "Minter",
      accountInfo.data
    );
  }

  async newMinterV1(
    wrapper: PublicKey,
    authority: PublicKey
  ): Promise<TransactionEnvelope> {
    const [minter, bump] = await findMinterAddress(
      wrapper,
      authority,
      this.program.programId
    );
    return this.provider.newTX([
      this.program.instruction.newMinter(bump, {
        accounts: {
          auth: {
            mintWrapper: wrapper,
            admin: this.provider.wallet.publicKey,
          },
          newMinterAuthority: authority,
          minter,
          payer: this.provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        },
      }),
    ]);
  }

  async newMinter(
    wrapper: PublicKey,
    authority: PublicKey
  ): Promise<TransactionEnvelope> {
    const [minter] = await findMinterAddress(
      wrapper,
      authority,
      this.program.programId
    );
    return this.provider.newTX([
      this.program.instruction.newMinterV2({
        accounts: {
          auth: {
            mintWrapper: wrapper,
            admin: this.provider.wallet.publicKey,
          },
          newMinterAuthority: authority,
          minter,
          payer: this.provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        },
      }),
    ]);
  }

  /**
   * Updates a minter's allowance.
   * @param minter
   * @param allowance
   * @returns
   */
  async minterUpdate(
    wrapper: PublicKey,
    authority: PublicKey,
    allowance: u64
  ): Promise<TransactionEnvelope> {
    const [minter] = await findMinterAddress(
      wrapper,
      authority,
      this.program.programId
    );
    return this.provider.newTX([
      this.program.instruction.minterUpdate(allowance, {
        accounts: {
          auth: {
            mintWrapper: wrapper,
            admin: this.provider.wallet.publicKey,
          },
          minter,
        },
      }),
    ]);
  }

  /**
   * Creates a new Minter with an allowance.
   * @param wrapper
   * @param authority
   * @param allowance
   * @returns
   */
  async newMinterWithAllowance(
    wrapper: PublicKey,
    authority: PublicKey,
    allowance: u64
  ): Promise<TransactionEnvelope> {
    const newMinter = await this.newMinter(wrapper, authority);
    const updateAllowance = await this.minterUpdate(
      wrapper,
      authority,
      allowance
    );
    return newMinter.combine(updateAllowance);
  }

  transferAdmin(wrapper: PublicKey, nextAdmin: PublicKey): TransactionEnvelope {
    return this.provider.newTX([
      this.program.instruction.transferAdmin({
        accounts: {
          mintWrapper: wrapper,
          admin: this.provider.wallet.publicKey,
          nextAdmin,
        },
      }),
    ]);
  }

  acceptAdmin(wrapper: PublicKey): TransactionEnvelope {
    return this.provider.newTX([
      this.program.instruction.acceptAdmin({
        accounts: {
          mintWrapper: wrapper,
          pendingAdmin: this.provider.wallet.publicKey,
        },
      }),
    ]);
  }

  /**
   * Mints tokens to an address as a Minter on the Mint Wrapper.
   */
  async performMintTo({
    amount,
    mintWrapper,
    minterAuthority = this.provider.wallet.publicKey,
    destOwner = this.provider.wallet.publicKey,
  }: {
    amount: TokenAmount;
    mintWrapper: PublicKey;
    minterAuthority?: PublicKey;
    destOwner?: PublicKey;
  }): Promise<TransactionEnvelope> {
    const ata = await getOrCreateATA({
      provider: this.provider,
      mint: amount.token.mintAccount,
      owner: destOwner,
    });
    const [minter] = await findMinterAddress(mintWrapper, minterAuthority);
    return this.sdk.provider.newTX([
      ata.instruction,
      this.program.instruction.performMint(amount.toU64(), {
        accounts: {
          mintWrapper,
          minterAuthority,
          tokenMint: amount.token.mintAccount,
          destination: ata.address,
          minter,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      }),
    ]);
  }

  /**
   * Create metadata in metaplex
   */
  async createMintMetadata(
    name: string,
    symbol: string,
    uri: string,
    tokenMint: Token,
    mintWrapper: PublicKey
  ): Promise<TransactionEnvelope> {
    const minterAuthority = this.provider.wallet.publicKey;
    // Public key that identifies the metadata program.
    const METADATA_PROGRAM_ID = new PublicKey(
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
    );

    async function findMetadataAddress(mint: PublicKey) {
      const [publicKey] = await PublicKey.findProgramAddress(
        [
          Buffer.from("metadata"),
          METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );
      return publicKey;
    }

    const metadataInfo = await findMetadataAddress(
      new PublicKey(tokenMint.address)
    );

    console.log("mintWrapper", mintWrapper.toBase58());
    console.log("minterAuthority", minterAuthority.toBase58());
    console.log("tokenMint", tokenMint.address);
    console.log("metadataInfo", metadataInfo.toBase58());

    return this.sdk.provider.newTX([
      this.program.instruction.createMintMetadata(name, symbol, uri, {
        accounts: {
          mintWrapper,
          minterAuthority,
          tokenMint: tokenMint.address,
          metadataProgram: METADATA_PROGRAM_ID,
          metadataInfo: metadataInfo,
          systemProgram: SystemProgram.programId,
        },
      }),
    ]);
  }

  /**
   * Create metadata in metaplex
   */
  async setMetaplexUpdateAuthority(
    tokenMint: Token,
    mintWrapper: PublicKey,
    newUpdateAuthority: PublicKey
  ): Promise<TransactionEnvelope> {
    const minterAuthority = this.provider.wallet.publicKey;
    // Public key that identifies the metadata program.
    const METADATA_PROGRAM_ID = new PublicKey(
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
    );

    async function findMetadataAddress(mint: PublicKey) {
      const [publicKey] = await PublicKey.findProgramAddress(
        [
          Buffer.from("metadata"),
          METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );
      return publicKey;
    }

    const metadataInfo = await findMetadataAddress(
      new PublicKey(tokenMint.address)
    );

    /*
    console.log("mintWrapper", mintWrapper.toBase58());
    console.log("minterAuthority", minterAuthority.toBase58());
    console.log("tokenMint", tokenMint.address);
    console.log("metadataInfo", metadataInfo.toBase58());
    console.log("newUpdateAuthority", newUpdateAuthority.toBase58());
    */

    return this.sdk.provider.newTX([
      this.program.instruction.setMetaplexUpdateAuthority({
        accounts: {
          mintWrapper,
          minterAuthority,
          tokenMint: tokenMint.address,
          metadataProgram: METADATA_PROGRAM_ID,
          metadataInfo: metadataInfo,
          systemProgram: SystemProgram.programId,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          newUpdateAuthority: newUpdateAuthority,
        },
      }),
    ]);
  }
  /**
   * Performs a mint of tokens to an account.
   * @deprecated use {@link performMintWithMinter}
   * @returns
   */
  async performMint({
    amount,
    minter,
  }: {
    amount: TokenAmount;
    minter: {
      accountId: PublicKey;
      accountInfo: AccountInfo<MinterData>;
    };
  }): Promise<TransactionEnvelope> {
    return await this.performMintWithMinter({
      amount,
      minter: {
        publicKey: minter.accountId,
        account: minter.accountInfo.data,
      },
    });
  }

  /**
   * Performs a mint of tokens to an account.
   * @returns
   */
  async performMintWithMinter({
    amount,
    minter,
  }: {
    amount: TokenAmount;
    minter: ProgramAccount<MinterData>;
  }): Promise<TransactionEnvelope> {
    const minterData = minter.account;
    const ata = await getOrCreateATA({
      provider: this.provider,
      mint: amount.token.mintAccount,
      owner: this.provider.wallet.publicKey,
    });
    return this.provider.newTX([
      ata.instruction,
      this.program.instruction.performMint(amount.toU64(), {
        accounts: {
          mintWrapper: minterData.mintWrapper,
          minterAuthority: minterData.minterAuthority,
          tokenMint: amount.token.mintAccount,
          destination: ata.address,
          minter: minter.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      }),
    ]);
  }
}
