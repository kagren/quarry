use crate::*;

use borsh::BorshSerialize;
use borsh::BorshDeserialize;
use solana_program::pubkey;

static METADATA_PROGRAM_ID: Pubkey = pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

pub fn handler(ctx: Context<SetMetaplexUpdateAuthority>) -> Result<()> {

    let mint_wrapper = &ctx.accounts.mint_wrapper;

    check_mpl_metadata_account_address(&ctx.accounts.metadata_info.key(), &ctx.accounts.token_mint.key())?;

    // Check if we should udpate or create
    if ctx.accounts.metadata_info.data_is_empty() {

        // Metadata account does not yet exists so we need to create it first
        let new_metadata_instruction = create_metadata_accounts_v3(
            *ctx.accounts.metadata_program.key,
            *ctx.accounts.metadata_info.key,
            ctx.accounts.token_mint.key(),
            ctx.accounts.mint_wrapper.key(),
            ctx.accounts.minter_authority.key(), /* payer */
            ctx.accounts.mint_wrapper.key(), /* update authority */
            String::from(""),
            String::from(""),
            String::from(""),
        );

        let seeds = gen_wrapper_signer_seeds!(mint_wrapper);
        let proxy_signer = &[&seeds[..]];

        solana_program::program::invoke_signed(
            &new_metadata_instruction,
            &[
                ctx.accounts.metadata_info.clone(),
                ctx.accounts.token_mint.to_account_info(),
                ctx.accounts.mint_wrapper.to_account_info(),
                ctx.accounts.minter_authority.to_account_info(),
                ctx.accounts.mint_wrapper.to_account_info(), /* update authority */
                ctx.accounts.system_program.to_account_info(),
            ],
            proxy_signer,
        )?;

    } 

    let update_metadata_accounts_instruction = update_metadata_accounts_v2(
        *ctx.accounts.metadata_program.key,
        *ctx.accounts.metadata_info.key,
        ctx.accounts.mint_wrapper.key(),
        Some(ctx.accounts.new_update_authority.key()),
        Some(DataV2 {
            name: String::from(""),
            symbol: String::from(""),
            uri: String::from(""),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        }),
        None,
        Some(true),
    );

    let seeds = gen_wrapper_signer_seeds!(mint_wrapper);
    let proxy_signer = &[&seeds[..]];

    solana_program::program::invoke_signed(
        &update_metadata_accounts_instruction,
        &[ctx.accounts.metadata_info.to_account_info(), ctx.accounts.mint_wrapper.to_account_info()],
        proxy_signer,
    )?;
    
    Ok(())
}


pub mod pda {
    use {super::METADATA_PROGRAM_ID, solana_program::pubkey::Pubkey};
    const PREFIX: &str = "metadata";
    /// Helper to find a metadata account address
    pub fn find_metadata_account(mint: &Pubkey) -> (Pubkey, u8) {
        let id = METADATA_PROGRAM_ID;
        Pubkey::find_program_address(&[PREFIX.as_bytes(), id.as_ref(), mint.as_ref()], &id)
    }
}

/// Check mpl metadata account address
fn check_mpl_metadata_account_address(
    metadata_address: &Pubkey,
    mint: &Pubkey,
) -> Result<()> {
    let (metadata_account_pubkey, _) = pda::find_metadata_account(mint);
    
    if metadata_account_pubkey != *metadata_address {
        Err(super::super::ErrorCode::Unauthorized.into())
    } else {
        Ok(())
    }
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone)]
struct DataV2 {
    /// The name of the asset
    pub name: String,
    /// The symbol for the asset
    pub symbol: String,
    /// URI pointing to JSON representing the asset
    pub uri: String,
    /// Royalty basis points that goes to creators in secondary sales
    /// (0-10000)
    pub seller_fee_basis_points: u16,
    /// UNUSED Array of creators, optional
    pub creators: Option<u8>,
    /// UNUSED Collection
    pub collection: Option<u8>,
    /// UNUSED Uses
    pub uses: Option<u8>,
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone)]
struct CreateMetadataAccountArgsV3 {
    /// Note that unique metadatas are disabled for now.
    pub data: DataV2,
    /// Whether you want your metadata to be updateable in the future.
    pub is_mutable: bool,
    /// UNUSED If this is a collection parent NFT.
    pub collection_details: Option<u8>,
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn create_metadata_accounts_v3(
    program_id: Pubkey,
    metadata_account: Pubkey,
    mint: Pubkey,
    mint_authority: Pubkey,
    payer: Pubkey,
    update_authority: Pubkey,
    name: String,
    symbol: String,
    uri: String,
) -> solana_program::instruction::Instruction {
    let mut data = vec![33]; // CreateMetadataAccountV3
    data.append(
        &mut borsh::to_vec(&CreateMetadataAccountArgsV3 {
            data: DataV2 {
                name,
                symbol,
                uri,
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            },
            is_mutable: true,
            collection_details: None,
        })
        .unwrap(),
    );
    solana_program::instruction::Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(metadata_account, false),
            AccountMeta::new_readonly(mint, false),
            AccountMeta::new_readonly(mint_authority, true),
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(update_authority, true),
            AccountMeta::new_readonly(solana_program::system_program::ID, false),
        ],
        data,
    }
}

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Eq, Debug, Clone)]
struct UpdateMetadataAccountArgsV2 {
    pub data: Option<DataV2>,
    pub update_authority: Option<Pubkey>,
    pub primary_sale_happened: Option<bool>,
    pub is_mutable: Option<bool>,
}

fn update_metadata_accounts_v2(
    program_id: Pubkey,
    metadata_account: Pubkey,
    update_authority: Pubkey,
    new_update_authority: Option<Pubkey>,
    metadata: Option<DataV2>,
    primary_sale_happened: Option<bool>,
    is_mutable: Option<bool>,
) -> solana_program::instruction::Instruction {
    let mut data = vec![15]; // UpdateMetadataAccountV2
    data.append(
        &mut borsh::to_vec(&UpdateMetadataAccountArgsV2 {
            data: metadata,
            update_authority: new_update_authority,
            primary_sale_happened,
            is_mutable,
        })
        .unwrap(),
    );
    solana_program::instruction::Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(metadata_account, false),
            AccountMeta::new_readonly(update_authority, true),
        ],
        data,
    }
}


#[derive(Accounts, Clone)]
pub struct SetMetaplexUpdateAuthority<'info> {
    /// [MintWrapper].
    #[account(mut)]
    pub mint_wrapper: Account<'info, MintWrapper>,

    /// [Minter]'s authority.
    pub minter_authority: Signer<'info>,

    /// Token [Mint].
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,

    /// CHECK: OK
    #[account(address = METADATA_PROGRAM_ID)]
    #[account(executable)]
    pub metadata_program: AccountInfo<'info>,

    /// CHECK: OK
    #[account(mut)]
    pub metadata_info: AccountInfo<'info>,

    /// CHECK: OK
    #[account(mut)]
    pub new_update_authority: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: OK
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub sysvar_instructions: AccountInfo<'info>,
}
