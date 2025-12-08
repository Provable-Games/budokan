use budokan_entry_requirement::tests::mocks::entry_validator_mock::{
    IEntryValidatorMockDispatcher, IEntryValidatorMockDispatcherTrait,
};
use budokan_entry_requirement::tests::mocks::erc721_mock::{
    IERC721MockDispatcher, IERC721MockDispatcherTrait, IERC721MockPublicDispatcher,
    IERC721MockPublicDispatcherTrait,
};
use budokan_interfaces::entry_validator::{
    IEntryValidatorDispatcher, IEntryValidatorDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

// Mock budokan/tournament address used across tests
fn budokan_address() -> ContractAddress {
    0x1234.try_into().unwrap()
}

fn deploy_erc721() -> IERC721MockDispatcher {
    let contract = declare("erc721_mock").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![]).unwrap();
    IERC721MockDispatcher { contract_address }
}

fn deploy_entry_validator() -> ContractAddress {
    let contract = declare("entry_validator_mock").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![budokan_address().into()]).unwrap();
    contract_address
}

fn configure_entry_validator(
    validator_address: ContractAddress,
    tournament_id: u64,
    entry_limit: u8,
    erc721_address: ContractAddress,
) {
    let validator = IEntryValidatorDispatcher { contract_address: validator_address };
    let mut config = array![erc721_address.into()];
    // Set caller to budokan address to pass assert_only_budokan check
    start_cheat_caller_address(validator_address, budokan_address());
    validator.add_config(tournament_id, entry_limit, config.span());
    stop_cheat_caller_address(validator_address);
}

fn deploy_open_entry_validator() -> ContractAddress {
    let contract = declare("open_entry_validator_mock").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![budokan_address().into()]).unwrap();
    contract_address
}

#[test]
fn test_valid_entry_with_token_ownership() {
    // Deploy ERC721 mock
    let erc721 = deploy_erc721();

    // Deploy and configure entry validator
    let tournament_id: u64 = 1;
    let entry_validator_address = deploy_entry_validator();
    configure_entry_validator(entry_validator_address, tournament_id, 0, erc721.contract_address);
    let entry_validator = IEntryValidatorDispatcher { contract_address: entry_validator_address };

    // Create a player address
    let player: ContractAddress = 0x123.try_into().unwrap();

    // Mint a token to the player
    let erc721_public = IERC721MockPublicDispatcher { contract_address: erc721.contract_address };
    erc721_public.mint(player, 1);

    // Verify the player owns the token
    let balance = erc721.balance_of(player);
    assert(balance == 1, 'Player should own 1 token');

    // Test that the player can enter
    let can_enter = entry_validator.valid_entry(tournament_id, player, array![].span());
    assert(can_enter, 'Player with token should enter');
}

#[test]
fn test_invalid_entry_without_token_ownership() {
    // Deploy ERC721 mock
    let erc721 = deploy_erc721();

    // Deploy and configure entry validator
    let tournament_id: u64 = 1;
    let entry_validator_address = deploy_entry_validator();
    configure_entry_validator(entry_validator_address, tournament_id, 0, erc721.contract_address);
    let entry_validator = IEntryValidatorDispatcher { contract_address: entry_validator_address };

    // Create a player address without any tokens
    let player: ContractAddress = 0x456.try_into().unwrap();

    // Verify the player owns no tokens
    let balance = erc721.balance_of(player);
    assert(balance == 0, 'Player should own 0 tokens');

    // Test that the player cannot enter
    let can_enter = entry_validator.valid_entry(tournament_id, player, array![].span());
    assert(!can_enter, 'No token: cannot enter');
}

#[test]
fn test_valid_entry_with_multiple_tokens() {
    // Deploy ERC721 mock
    let erc721 = deploy_erc721();

    // Deploy and configure entry validator
    let tournament_id: u64 = 1;
    let entry_validator_address = deploy_entry_validator();
    configure_entry_validator(entry_validator_address, tournament_id, 0, erc721.contract_address);
    let entry_validator = IEntryValidatorDispatcher { contract_address: entry_validator_address };

    // Create a player address
    let player: ContractAddress = 0x789.try_into().unwrap();

    // Mint multiple tokens to the player
    let erc721_public = IERC721MockPublicDispatcher { contract_address: erc721.contract_address };
    erc721_public.mint(player, 1);
    erc721_public.mint(player, 2);
    erc721_public.mint(player, 3);

    // Verify the player owns multiple tokens
    let balance = erc721.balance_of(player);
    assert(balance == 3, 'Player should own 3 tokens');

    // Test that the player can enter
    let can_enter = entry_validator.valid_entry(tournament_id, player, array![].span());
    assert(can_enter, 'Player with tokens should enter');
}

#[test]
fn test_entry_status_changes_after_transfer() {
    // Deploy ERC721 mock
    let erc721 = deploy_erc721();

    // Deploy and configure entry validator
    let tournament_id: u64 = 1;
    let entry_validator_address = deploy_entry_validator();
    configure_entry_validator(entry_validator_address, tournament_id, 0, erc721.contract_address);
    let entry_validator = IEntryValidatorDispatcher { contract_address: entry_validator_address };

    // Create player addresses
    let player1: ContractAddress = 0xAAA.try_into().unwrap();
    let player2: ContractAddress = 0xBBB.try_into().unwrap();

    // Mint a token to player1
    let erc721_public = IERC721MockPublicDispatcher { contract_address: erc721.contract_address };
    erc721_public.mint(player1, 1);

    // Verify player1 can enter
    let can_enter = entry_validator.valid_entry(tournament_id, player1, array![].span());
    assert(can_enter, 'Player1 should enter initially');

    // Verify player2 cannot enter
    let can_enter = entry_validator.valid_entry(tournament_id, player2, array![].span());
    assert(!can_enter, 'Player2 no token initially');

    // Transfer token from player1 to player2
    snforge_std::start_cheat_caller_address(erc721.contract_address, player1);
    erc721.transfer_from(player1, player2, 1);
    snforge_std::stop_cheat_caller_address(erc721.contract_address);

    // Verify player1 can no longer enter
    let can_enter = entry_validator.valid_entry(tournament_id, player1, array![].span());
    assert(!can_enter, 'Player1 no token after xfer');

    // Verify player2 can now enter
    let can_enter = entry_validator.valid_entry(tournament_id, player2, array![].span());
    assert(can_enter, 'Player2 can enter after xfer');
}

#[test]
fn test_entry_validator_stores_correct_erc721_address() {
    // Deploy ERC721 mock
    let erc721 = deploy_erc721();

    // Deploy and configure entry validator
    let tournament_id: u64 = 1;
    let entry_validator_address = deploy_entry_validator();
    configure_entry_validator(entry_validator_address, tournament_id, 0, erc721.contract_address);
    let entry_validator_mock = IEntryValidatorMockDispatcher {
        contract_address: entry_validator_address,
    };

    // Verify the entry validator stores the correct ERC721 address for this tournament
    let stored_address = entry_validator_mock.get_tournament_erc721_address(tournament_id);
    assert(stored_address == erc721.contract_address, 'Wrong ERC721 address stored');
}

#[test]
fn test_multiple_players_with_different_ownership() {
    // Deploy ERC721 mock
    let erc721 = deploy_erc721();

    // Deploy and configure entry validator
    let tournament_id: u64 = 1;
    let entry_validator_address = deploy_entry_validator();
    configure_entry_validator(entry_validator_address, tournament_id, 0, erc721.contract_address);
    let entry_validator = IEntryValidatorDispatcher { contract_address: entry_validator_address };

    // Create multiple player addresses
    let player1: ContractAddress = 0x111.try_into().unwrap();
    let player2: ContractAddress = 0x222.try_into().unwrap();
    let player3: ContractAddress = 0x333.try_into().unwrap();

    // Mint tokens to player1 and player3 only
    let erc721_public = IERC721MockPublicDispatcher { contract_address: erc721.contract_address };
    erc721_public.mint(player1, 1);
    erc721_public.mint(player3, 2);

    // Test entry validation for all players
    let can_enter_p1 = entry_validator.valid_entry(tournament_id, player1, array![].span());
    assert(can_enter_p1, 'Player1 should enter');

    let can_enter_p2 = entry_validator.valid_entry(tournament_id, player2, array![].span());
    assert(!can_enter_p2, 'Player2 should not enter');

    let can_enter_p3 = entry_validator.valid_entry(tournament_id, player3, array![].span());
    assert(can_enter_p3, 'Player3 should enter');
}

// ========================================
// Open Entry Validator Tests
// ========================================

#[test]
fn test_open_validator_allows_entry_without_tokens() {
    // Deploy open entry validator (no token gating)
    let open_validator_address = deploy_open_entry_validator();
    let open_validator = IEntryValidatorDispatcher { contract_address: open_validator_address };

    // Create a player address without any tokens
    let player: ContractAddress = 0x999.try_into().unwrap();

    // Test that the player can enter even without tokens (tournament_id doesn't matter for open
    // validator)
    let can_enter = open_validator.valid_entry(0, player, array![].span());
    assert(can_enter, 'Open: player should enter');
}

#[test]
fn test_open_validator_allows_entry_with_tokens() {
    // Deploy ERC721 mock
    let erc721 = deploy_erc721();

    // Deploy open entry validator
    let open_validator_address = deploy_open_entry_validator();
    let open_validator = IEntryValidatorDispatcher { contract_address: open_validator_address };

    // Create a player address
    let player: ContractAddress = 0x888.try_into().unwrap();

    // Mint a token to the player
    let erc721_public = IERC721MockPublicDispatcher { contract_address: erc721.contract_address };
    erc721_public.mint(player, 1);

    // Test that the player can still enter (tokens don't matter)
    let can_enter = open_validator.valid_entry(0, player, array![].span());
    assert(can_enter, 'Open: player with token enters');
}

#[test]
fn test_open_validator_allows_multiple_players() {
    // Deploy open entry validator
    let open_validator_address = deploy_open_entry_validator();
    let open_validator = IEntryValidatorDispatcher { contract_address: open_validator_address };

    // Create multiple player addresses
    let player1: ContractAddress = 0xAAA.try_into().unwrap();
    let player2: ContractAddress = 0xBBB.try_into().unwrap();
    let player3: ContractAddress = 0xCCC.try_into().unwrap();

    // Test that all players can enter
    let can_enter_p1 = open_validator.valid_entry(0, player1, array![].span());
    assert(can_enter_p1, 'Open: player1 should enter');

    let can_enter_p2 = open_validator.valid_entry(0, player2, array![].span());
    assert(can_enter_p2, 'Open: player2 should enter');

    let can_enter_p3 = open_validator.valid_entry(0, player3, array![].span());
    assert(can_enter_p3, 'Open: player3 should enter');
}

#[test]
fn test_compare_open_vs_token_gated_validators() {
    // Deploy ERC721 mock
    let erc721 = deploy_erc721();

    // Deploy both validators
    let tournament_id: u64 = 1;
    let token_gated_address = deploy_entry_validator();
    configure_entry_validator(token_gated_address, tournament_id, 0, erc721.contract_address);
    let token_gated = IEntryValidatorDispatcher { contract_address: token_gated_address };

    let open_validator_address = deploy_open_entry_validator();
    let open_validator = IEntryValidatorDispatcher { contract_address: open_validator_address };

    // Create two players: one with token, one without
    let player_with_token: ContractAddress = 0x111.try_into().unwrap();
    let player_without_token: ContractAddress = 0x222.try_into().unwrap();

    // Mint token to first player only
    let erc721_public = IERC721MockPublicDispatcher { contract_address: erc721.contract_address };
    erc721_public.mint(player_with_token, 1);

    // Test token-gated validator
    let can_enter_gated_with = token_gated
        .valid_entry(tournament_id, player_with_token, array![].span());
    assert(can_enter_gated_with, 'Gated: with token enters');

    let can_enter_gated_without = token_gated
        .valid_entry(tournament_id, player_without_token, array![].span());
    assert(!can_enter_gated_without, 'Gated: without token blocked');

    // Test open validator - both should enter
    let can_enter_open_with = open_validator.valid_entry(0, player_with_token, array![].span());
    assert(can_enter_open_with, 'Open: with token enters');

    let can_enter_open_without = open_validator
        .valid_entry(0, player_without_token, array![].span());
    assert(can_enter_open_without, 'Open: without token enters');
}
