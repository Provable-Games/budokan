const BUDOKAN_ABI = [
  {
    type: "impl",
    name: "Budokan__ContractImpl",
    interface_name: "dojo::contract::interface::IContract",
  },
  {
    type: "interface",
    name: "dojo::contract::interface::IContract",
    items: [],
  },
  {
    type: "impl",
    name: "Budokan__DeployedContractImpl",
    interface_name: "dojo::meta::interface::IDeployedResource",
  },
  {
    type: "struct",
    name: "core::byte_array::ByteArray",
    members: [
      {
        name: "data",
        type: "core::array::Array::<core::bytes_31::bytes31>",
      },
      {
        name: "pending_word",
        type: "core::felt252",
      },
      {
        name: "pending_word_len",
        type: "core::integer::u32",
      },
    ],
  },
  {
    type: "interface",
    name: "dojo::meta::interface::IDeployedResource",
    items: [
      {
        type: "function",
        name: "dojo_name",
        inputs: [],
        outputs: [
          {
            type: "core::byte_array::ByteArray",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::budokan::TokenType",
    variants: [
      {
        name: "erc20",
        type: "()",
      },
      {
        name: "erc721",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::TokenData",
    members: [
      {
        name: "token_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "token_type",
        type: "budokan::models::budokan::TokenType",
      },
    ],
  },
  {
    type: "struct",
    name: "core::array::Span::<budokan::models::budokan::TokenData>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<budokan::models::budokan::TokenData>",
      },
    ],
  },
  {
    type: "function",
    name: "dojo_init",
    inputs: [
      {
        name: "default_token_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "registered_tokens",
        type: "core::array::Span::<budokan::models::budokan::TokenData>",
      },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "impl",
    name: "GameContextImpl",
    interface_name:
      "game_components_metagame::extensions::context::interface::IMetagameContext",
  },
  {
    type: "enum",
    name: "core::bool",
    variants: [
      {
        name: "False",
        type: "()",
      },
      {
        name: "True",
        type: "()",
      },
    ],
  },
  {
    type: "interface",
    name: "game_components_metagame::extensions::context::interface::IMetagameContext",
    items: [
      {
        type: "function",
        name: "has_context",
        inputs: [
          {
            name: "token_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "core::bool",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "impl",
    name: "GameContextDetailsImpl",
    interface_name:
      "game_components_metagame::extensions::context::interface::IMetagameContextDetails",
  },
  {
    type: "enum",
    name: "core::option::Option::<core::integer::u32>",
    variants: [
      {
        name: "Some",
        type: "core::integer::u32",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "game_components_metagame::extensions::context::structs::GameContext",
    members: [
      {
        name: "name",
        type: "core::byte_array::ByteArray",
      },
      {
        name: "value",
        type: "core::byte_array::ByteArray",
      },
    ],
  },
  {
    type: "struct",
    name: "core::array::Span::<game_components_metagame::extensions::context::structs::GameContext>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<game_components_metagame::extensions::context::structs::GameContext>",
      },
    ],
  },
  {
    type: "struct",
    name: "game_components_metagame::extensions::context::structs::GameContextDetails",
    members: [
      {
        name: "name",
        type: "core::byte_array::ByteArray",
      },
      {
        name: "description",
        type: "core::byte_array::ByteArray",
      },
      {
        name: "id",
        type: "core::option::Option::<core::integer::u32>",
      },
      {
        name: "context",
        type: "core::array::Span::<game_components_metagame::extensions::context::structs::GameContext>",
      },
    ],
  },
  {
    type: "interface",
    name: "game_components_metagame::extensions::context::interface::IMetagameContextDetails",
    items: [
      {
        type: "function",
        name: "context_details",
        inputs: [
          {
            name: "token_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "game_components_metagame::extensions::context::structs::GameContextDetails",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "impl",
    name: "BudokanImpl",
    interface_name: "budokan::interfaces::IBudokan",
  },
  {
    type: "struct",
    name: "budokan::models::budokan::Metadata",
    members: [
      {
        name: "name",
        type: "core::felt252",
      },
      {
        name: "description",
        type: "core::byte_array::ByteArray",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::schedule::Period",
    members: [
      {
        name: "start",
        type: "core::integer::u64",
      },
      {
        name: "end",
        type: "core::integer::u64",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<budokan::models::schedule::Period>",
    variants: [
      {
        name: "Some",
        type: "budokan::models::schedule::Period",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::schedule::Schedule",
    members: [
      {
        name: "registration",
        type: "core::option::Option::<budokan::models::schedule::Period>",
      },
      {
        name: "game",
        type: "budokan::models::schedule::Period",
      },
      {
        name: "submission_duration",
        type: "core::integer::u64",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::GameConfig",
    members: [
      {
        name: "address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "settings_id",
        type: "core::integer::u32",
      },
      {
        name: "prize_spots",
        type: "core::integer::u8",
      },
    ],
  },
  {
    type: "struct",
    name: "core::array::Span::<core::integer::u8>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<core::integer::u8>",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<core::integer::u8>",
    variants: [
      {
        name: "Some",
        type: "core::integer::u8",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::EntryFee",
    members: [
      {
        name: "token_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "amount",
        type: "core::integer::u128",
      },
      {
        name: "distribution",
        type: "core::array::Span::<core::integer::u8>",
      },
      {
        name: "tournament_creator_share",
        type: "core::option::Option::<core::integer::u8>",
      },
      {
        name: "game_creator_share",
        type: "core::option::Option::<core::integer::u8>",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<budokan::models::budokan::EntryFee>",
    variants: [
      {
        name: "Some",
        type: "budokan::models::budokan::EntryFee",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "core::array::Span::<core::integer::u64>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<core::integer::u64>",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::budokan::TournamentType",
    variants: [
      {
        name: "winners",
        type: "core::array::Span::<core::integer::u64>",
      },
      {
        name: "participants",
        type: "core::array::Span::<core::integer::u64>",
      },
    ],
  },
  {
    type: "struct",
    name: "core::array::Span::<core::starknet::contract_address::ContractAddress>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<core::starknet::contract_address::ContractAddress>",
      },
    ],
  },
  {
    type: "struct",
    name: "core::array::Span::<core::felt252>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<core::felt252>",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::ExtensionConfig",
    members: [
      {
        name: "address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "config",
        type: "core::array::Span::<core::felt252>",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::budokan::EntryRequirementType",
    variants: [
      {
        name: "token",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "tournament",
        type: "budokan::models::budokan::TournamentType",
      },
      {
        name: "allowlist",
        type: "core::array::Span::<core::starknet::contract_address::ContractAddress>",
      },
      {
        name: "extension",
        type: "budokan::models::budokan::ExtensionConfig",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::EntryRequirement",
    members: [
      {
        name: "entry_limit",
        type: "core::integer::u8",
      },
      {
        name: "entry_requirement_type",
        type: "budokan::models::budokan::EntryRequirementType",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<budokan::models::budokan::EntryRequirement>",
    variants: [
      {
        name: "Some",
        type: "budokan::models::budokan::EntryRequirement",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::Tournament",
    members: [
      {
        name: "id",
        type: "core::integer::u64",
      },
      {
        name: "created_at",
        type: "core::integer::u64",
      },
      {
        name: "created_by",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "creator_token_id",
        type: "core::integer::u64",
      },
      {
        name: "metadata",
        type: "budokan::models::budokan::Metadata",
      },
      {
        name: "schedule",
        type: "budokan::models::schedule::Schedule",
      },
      {
        name: "game_config",
        type: "budokan::models::budokan::GameConfig",
      },
      {
        name: "entry_fee",
        type: "core::option::Option::<budokan::models::budokan::EntryFee>",
      },
      {
        name: "entry_requirement",
        type: "core::option::Option::<budokan::models::budokan::EntryRequirement>",
      },
      {
        name: "soulbound",
        type: "core::bool",
      },
      {
        name: "play_url",
        type: "core::byte_array::ByteArray",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::schedule::Phase",
    variants: [
      {
        name: "Scheduled",
        type: "()",
      },
      {
        name: "Registration",
        type: "()",
      },
      {
        name: "Staging",
        type: "()",
      },
      {
        name: "Live",
        type: "()",
      },
      {
        name: "Submission",
        type: "()",
      },
      {
        name: "Finalized",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::ERC20Data",
    members: [
      {
        name: "amount",
        type: "core::integer::u128",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::ERC721Data",
    members: [
      {
        name: "id",
        type: "core::integer::u128",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::budokan::TokenTypeData",
    variants: [
      {
        name: "erc20",
        type: "budokan::models::budokan::ERC20Data",
      },
      {
        name: "erc721",
        type: "budokan::models::budokan::ERC721Data",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::Registration",
    members: [
      {
        name: "game_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "game_token_id",
        type: "core::integer::u64",
      },
      {
        name: "tournament_id",
        type: "core::integer::u64",
      },
      {
        name: "entry_number",
        type: "core::integer::u32",
      },
      {
        name: "has_submitted",
        type: "core::bool",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::RegistrationBanned",
    members: [
      {
        name: "game_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "game_token_id",
        type: "core::integer::u64",
      },
      {
        name: "tournament_id",
        type: "core::integer::u64",
      },
      {
        name: "is_banned",
        type: "core::bool",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::Prize",
    members: [
      {
        name: "id",
        type: "core::integer::u64",
      },
      {
        name: "tournament_id",
        type: "core::integer::u64",
      },
      {
        name: "payout_position",
        type: "core::integer::u8",
      },
      {
        name: "token_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "token_type",
        type: "budokan::models::budokan::TokenTypeData",
      },
      {
        name: "sponsor_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::TournamentQualification",
    members: [
      {
        name: "tournament_id",
        type: "core::integer::u64",
      },
      {
        name: "token_id",
        type: "core::integer::u64",
      },
      {
        name: "position",
        type: "core::integer::u8",
      },
    ],
  },
  {
    type: "struct",
    name: "core::integer::u256",
    members: [
      {
        name: "low",
        type: "core::integer::u128",
      },
      {
        name: "high",
        type: "core::integer::u128",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan::models::budokan::NFTQualification",
    members: [
      {
        name: "token_id",
        type: "core::integer::u256",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::budokan::QualificationProof",
    variants: [
      {
        name: "Tournament",
        type: "budokan::models::budokan::TournamentQualification",
      },
      {
        name: "NFT",
        type: "budokan::models::budokan::NFTQualification",
      },
      {
        name: "Address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "Extension",
        type: "core::array::Span::<core::felt252>",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<budokan::models::budokan::QualificationProof>",
    variants: [
      {
        name: "Some",
        type: "budokan::models::budokan::QualificationProof",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::budokan::Role",
    variants: [
      {
        name: "TournamentCreator",
        type: "()",
      },
      {
        name: "GameCreator",
        type: "()",
      },
      {
        name: "Position",
        type: "core::integer::u8",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::budokan::PrizeType",
    variants: [
      {
        name: "EntryFees",
        type: "budokan::models::budokan::Role",
      },
      {
        name: "Sponsored",
        type: "core::integer::u64",
      },
    ],
  },
  {
    type: "interface",
    name: "budokan::interfaces::IBudokan",
    items: [
      {
        type: "function",
        name: "total_tournaments",
        inputs: [],
        outputs: [
          {
            type: "core::integer::u64",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "tournament",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "budokan::models::budokan::Tournament",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "tournament_entries",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "core::integer::u32",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_leaderboard",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "core::array::Array::<core::integer::u64>",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "current_phase",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "budokan::models::schedule::Phase",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "is_token_registered",
        inputs: [
          {
            name: "address",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [
          {
            type: "core::bool",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "register_token",
        inputs: [
          {
            name: "address",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "token_type",
            type: "budokan::models::budokan::TokenTypeData",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "get_registration",
        inputs: [
          {
            name: "game_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "token_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "budokan::models::budokan::Registration",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_registration_banned",
        inputs: [
          {
            name: "game_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "token_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "budokan::models::budokan::RegistrationBanned",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_prize",
        inputs: [
          {
            name: "prize_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "budokan::models::budokan::Prize",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_tournament_id_for_token_id",
        inputs: [
          {
            name: "game_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "token_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "core::integer::u64",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "create_tournament",
        inputs: [
          {
            name: "creator_rewards_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "metadata",
            type: "budokan::models::budokan::Metadata",
          },
          {
            name: "schedule",
            type: "budokan::models::schedule::Schedule",
          },
          {
            name: "game_config",
            type: "budokan::models::budokan::GameConfig",
          },
          {
            name: "entry_fee",
            type: "core::option::Option::<budokan::models::budokan::EntryFee>",
          },
          {
            name: "entry_requirement",
            type: "core::option::Option::<budokan::models::budokan::EntryRequirement>",
          },
          {
            name: "soulbound",
            type: "core::bool",
          },
          {
            name: "play_url",
            type: "core::byte_array::ByteArray",
          },
        ],
        outputs: [
          {
            type: "budokan::models::budokan::Tournament",
          },
        ],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "enter_tournament",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
          {
            name: "player_name",
            type: "core::felt252",
          },
          {
            name: "player_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "qualification",
            type: "core::option::Option::<budokan::models::budokan::QualificationProof>",
          },
        ],
        outputs: [
          {
            type: "(core::integer::u64, core::integer::u32)",
          },
        ],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "validate_entries",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
          {
            name: "game_token_ids",
            type: "core::array::Span::<core::integer::u64>",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "submit_score",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
          {
            name: "token_id",
            type: "core::integer::u64",
          },
          {
            name: "position",
            type: "core::integer::u8",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "claim_prize",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
          {
            name: "prize_type",
            type: "budokan::models::budokan::PrizeType",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "add_prize",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
          {
            name: "token_address",
            type: "core::starknet::contract_address::ContractAddress",
          },
          {
            name: "token_type",
            type: "budokan::models::budokan::TokenTypeData",
          },
          {
            name: "position",
            type: "core::integer::u8",
          },
        ],
        outputs: [
          {
            type: "core::integer::u64",
          },
        ],
        state_mutability: "external",
      },
    ],
  },
  {
    type: "impl",
    name: "WorldProviderImpl",
    interface_name:
      "dojo::contract::components::world_provider::IWorldProvider",
  },
  {
    type: "struct",
    name: "dojo::world::iworld::IWorldDispatcher",
    members: [
      {
        name: "contract_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
  },
  {
    type: "interface",
    name: "dojo::contract::components::world_provider::IWorldProvider",
    items: [
      {
        type: "function",
        name: "world_dispatcher",
        inputs: [],
        outputs: [
          {
            type: "dojo::world::iworld::IWorldDispatcher",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "impl",
    name: "UpgradeableImpl",
    interface_name: "dojo::contract::components::upgradeable::IUpgradeable",
  },
  {
    type: "interface",
    name: "dojo::contract::components::upgradeable::IUpgradeable",
    items: [
      {
        type: "function",
        name: "upgrade",
        inputs: [
          {
            name: "new_class_hash",
            type: "core::starknet::class_hash::ClassHash",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
    ],
  },
  {
    type: "impl",
    name: "MetagameImpl",
    interface_name: "game_components_metagame::interface::IMetagame",
  },
  {
    type: "interface",
    name: "game_components_metagame::interface::IMetagame",
    items: [
      {
        type: "function",
        name: "context_address",
        inputs: [],
        outputs: [
          {
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "default_token_address",
        inputs: [],
        outputs: [
          {
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "impl",
    name: "SRC5Impl",
    interface_name: "openzeppelin_introspection::interface::ISRC5",
  },
  {
    type: "interface",
    name: "openzeppelin_introspection::interface::ISRC5",
    items: [
      {
        type: "function",
        name: "supports_interface",
        inputs: [
          {
            name: "interface_id",
            type: "core::felt252",
          },
        ],
        outputs: [
          {
            type: "core::bool",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "constructor",
    name: "constructor",
    inputs: [],
  },
  {
    type: "event",
    name: "dojo::contract::components::upgradeable::upgradeable_cpt::Upgraded",
    kind: "struct",
    members: [
      {
        name: "class_hash",
        type: "core::starknet::class_hash::ClassHash",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "dojo::contract::components::upgradeable::upgradeable_cpt::Event",
    kind: "enum",
    variants: [
      {
        name: "Upgraded",
        type: "dojo::contract::components::upgradeable::upgradeable_cpt::Upgraded",
        kind: "nested",
      },
    ],
  },
  {
    type: "event",
    name: "dojo::contract::components::world_provider::world_provider_cpt::Event",
    kind: "enum",
    variants: [],
  },
  {
    type: "event",
    name: "game_components_metagame::metagame::MetagameComponent::Event",
    kind: "enum",
    variants: [],
  },
  {
    type: "event",
    name: "game_components_metagame::extensions::context::context::ContextComponent::Event",
    kind: "enum",
    variants: [],
  },
  {
    type: "event",
    name: "openzeppelin_introspection::src5::SRC5Component::Event",
    kind: "enum",
    variants: [],
  },
  {
    type: "event",
    name: "budokan::budokan::Budokan::Event",
    kind: "enum",
    variants: [
      {
        name: "UpgradeableEvent",
        type: "dojo::contract::components::upgradeable::upgradeable_cpt::Event",
        kind: "nested",
      },
      {
        name: "WorldProviderEvent",
        type: "dojo::contract::components::world_provider::world_provider_cpt::Event",
        kind: "nested",
      },
      {
        name: "MetagameEvent",
        type: "game_components_metagame::metagame::MetagameComponent::Event",
        kind: "flat",
      },
      {
        name: "ContextEvent",
        type: "game_components_metagame::extensions::context::context::ContextComponent::Event",
        kind: "flat",
      },
      {
        name: "SRC5Event",
        type: "openzeppelin_introspection::src5::SRC5Component::Event",
        kind: "flat",
      },
    ],
  },
];

export default BUDOKAN_ABI;
