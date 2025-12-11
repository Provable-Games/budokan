const BUDOKAN_ABI = [
  {
    type: "impl",
    name: "UpgradeableImpl",
    interface_name: "openzeppelin_interfaces::upgrades::IUpgradeable",
  },
  {
    type: "interface",
    name: "openzeppelin_interfaces::upgrades::IUpgradeable",
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
        type: "core::internal::bounded_int::BoundedInt::<0, 30>",
      },
    ],
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
    interface_name: "budokan_interfaces::budokan::IBudokan",
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
    type: "struct",
    name: "core::array::Span::<core::integer::u16>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<core::integer::u16>",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan_distribution::models::Distribution",
    variants: [
      {
        name: "Linear",
        type: "core::integer::u16",
      },
      {
        name: "Exponential",
        type: "core::integer::u16",
      },
      {
        name: "Uniform",
        type: "()",
      },
      {
        name: "Custom",
        type: "core::array::Span::<core::integer::u16>",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<core::integer::u16>",
    variants: [
      {
        name: "Some",
        type: "core::integer::u16",
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
        type: "budokan_distribution::models::Distribution",
      },
      {
        name: "tournament_creator_share",
        type: "core::option::Option::<core::integer::u16>",
      },
      {
        name: "game_creator_share",
        type: "core::option::Option::<core::integer::u16>",
      },
      {
        name: "refund_share",
        type: "core::option::Option::<core::integer::u16>",
      },
      {
        name: "distribution_positions",
        type: "core::option::Option::<core::integer::u32>",
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
    name: "budokan_entry_requirement::models::ExtensionConfig",
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
    name: "budokan_entry_requirement::models::EntryRequirementType",
    variants: [
      {
        name: "token",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "allowlist",
        type: "core::array::Span::<core::starknet::contract_address::ContractAddress>",
      },
      {
        name: "extension",
        type: "budokan_entry_requirement::models::ExtensionConfig",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan_entry_requirement::models::EntryRequirement",
    members: [
      {
        name: "entry_limit",
        type: "core::integer::u32",
      },
      {
        name: "entry_requirement_type",
        type: "budokan_entry_requirement::models::EntryRequirementType",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<budokan_entry_requirement::models::EntryRequirement>",
    variants: [
      {
        name: "Some",
        type: "budokan_entry_requirement::models::EntryRequirement",
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
        type: "core::option::Option::<budokan_entry_requirement::models::EntryRequirement>",
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
    name: "budokan_entry_requirement::models::NFTQualification",
    members: [
      {
        name: "token_id",
        type: "core::integer::u256",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan_entry_requirement::models::QualificationProof",
    variants: [
      {
        name: "NFT",
        type: "budokan_entry_requirement::models::NFTQualification",
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
    name: "core::option::Option::<budokan_entry_requirement::models::QualificationProof>",
    variants: [
      {
        name: "Some",
        type: "budokan_entry_requirement::models::QualificationProof",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan_prize::models::PrizeType",
    variants: [
      {
        name: "Single",
        type: "core::integer::u64",
      },
      {
        name: "Distributed",
        type: "(core::integer::u64, core::integer::u32)",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::budokan::EntryFeeRewardType",
    variants: [
      {
        name: "Position",
        type: "core::integer::u32",
      },
      {
        name: "GameCreator",
        type: "()",
      },
      {
        name: "Refund",
        type: "core::integer::u64",
      },
      {
        name: "AdditionalShare",
        type: "core::integer::u8",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan::models::budokan::RewardType",
    variants: [
      {
        name: "Prize",
        type: "budokan_prize::models::PrizeType",
      },
      {
        name: "EntryFee",
        type: "budokan::models::budokan::EntryFeeRewardType",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<budokan_distribution::models::Distribution>",
    variants: [
      {
        name: "Some",
        type: "budokan_distribution::models::Distribution",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan_prize::models::ERC20Data",
    members: [
      {
        name: "amount",
        type: "core::integer::u128",
      },
      {
        name: "distribution",
        type: "core::option::Option::<budokan_distribution::models::Distribution>",
      },
      {
        name: "distribution_count",
        type: "core::option::Option::<core::integer::u32>",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan_prize::models::ERC721Data",
    members: [
      {
        name: "id",
        type: "core::integer::u128",
      },
    ],
  },
  {
    type: "enum",
    name: "budokan_prize::models::TokenTypeData",
    variants: [
      {
        name: "erc20",
        type: "budokan_prize::models::ERC20Data",
      },
      {
        name: "erc721",
        type: "budokan_prize::models::ERC721Data",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan_prize::models::Prize",
    members: [
      {
        name: "id",
        type: "core::integer::u64",
      },
      {
        name: "context_id",
        type: "core::integer::u64",
      },
      {
        name: "token_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "token_type",
        type: "budokan_prize::models::TokenTypeData",
      },
      {
        name: "sponsor_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
  },
  {
    type: "interface",
    name: "budokan_interfaces::budokan::IBudokan",
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
            type: "core::option::Option::<budokan_entry_requirement::models::EntryRequirement>",
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
            type: "core::option::Option::<budokan_entry_requirement::models::QualificationProof>",
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
        name: "validate_entry",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
          {
            name: "game_token_id",
            type: "core::integer::u64",
          },
          {
            name: "proof",
            type: "core::array::Span::<core::felt252>",
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
          {
            name: "reward_type",
            type: "budokan::models::budokan::RewardType",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "claim_reward",
        inputs: [
          {
            name: "tournament_id",
            type: "core::integer::u64",
          },
          {
            name: "reward_type",
            type: "budokan::models::budokan::RewardType",
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
            type: "budokan_prize::models::TokenTypeData",
          },
          {
            name: "position",
            type: "core::option::Option::<core::integer::u32>",
          },
        ],
        outputs: [
          {
            type: "budokan_prize::models::Prize",
          },
        ],
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
    interface_name: "openzeppelin_interfaces::introspection::ISRC5",
  },
  {
    type: "interface",
    name: "openzeppelin_interfaces::introspection::ISRC5",
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
    type: "impl",
    name: "OwnableImpl",
    interface_name: "openzeppelin_interfaces::access::ownable::IOwnable",
  },
  {
    type: "interface",
    name: "openzeppelin_interfaces::access::ownable::IOwnable",
    items: [
      {
        type: "function",
        name: "owner",
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
        name: "transfer_ownership",
        inputs: [
          {
            name: "new_owner",
            type: "core::starknet::contract_address::ContractAddress",
          },
        ],
        outputs: [],
        state_mutability: "external",
      },
      {
        type: "function",
        name: "renounce_ownership",
        inputs: [],
        outputs: [],
        state_mutability: "external",
      },
    ],
  },
  {
    type: "impl",
    name: "EntryFeeImpl",
    interface_name: "budokan_interfaces::entry_fee::IEntryFee",
  },
  {
    type: "struct",
    name: "budokan_entry_fee::models::AdditionalShare",
    members: [
      {
        name: "recipient",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "share_bps",
        type: "core::integer::u16",
      },
    ],
  },
  {
    type: "struct",
    name: "core::array::Span::<budokan_entry_fee::models::AdditionalShare>",
    members: [
      {
        name: "snapshot",
        type: "@core::array::Array::<budokan_entry_fee::models::AdditionalShare>",
      },
    ],
  },
  {
    type: "struct",
    name: "budokan_entry_fee::models::EntryFee",
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
        name: "game_creator_share",
        type: "core::option::Option::<core::integer::u16>",
      },
      {
        name: "refund_share",
        type: "core::option::Option::<core::integer::u16>",
      },
      {
        name: "additional_shares",
        type: "core::array::Span::<budokan_entry_fee::models::AdditionalShare>",
      },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<budokan_entry_fee::models::EntryFee>",
    variants: [
      {
        name: "Some",
        type: "budokan_entry_fee::models::EntryFee",
      },
      {
        name: "None",
        type: "()",
      },
    ],
  },
  {
    type: "interface",
    name: "budokan_interfaces::entry_fee::IEntryFee",
    items: [
      {
        type: "function",
        name: "get_entry_fee",
        inputs: [
          {
            name: "context_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "core::option::Option::<budokan_entry_fee::models::EntryFee>",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "impl",
    name: "EntryRequirementImpl",
    interface_name: "budokan_interfaces::entry_requirement::IEntryRequirement",
  },
  {
    type: "struct",
    name: "budokan_entry_requirement::models::QualificationEntries",
    members: [
      {
        name: "context_id",
        type: "core::integer::u64",
      },
      {
        name: "qualification_proof",
        type: "budokan_entry_requirement::models::QualificationProof",
      },
      {
        name: "entry_count",
        type: "core::integer::u8",
      },
    ],
  },
  {
    type: "interface",
    name: "budokan_interfaces::entry_requirement::IEntryRequirement",
    items: [
      {
        type: "function",
        name: "get_entry_requirement",
        inputs: [
          {
            name: "context_id",
            type: "core::integer::u64",
          },
        ],
        outputs: [
          {
            type: "core::option::Option::<budokan_entry_requirement::models::EntryRequirement>",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_qualification_entries",
        inputs: [
          {
            name: "context_id",
            type: "core::integer::u64",
          },
          {
            name: "proof",
            type: "budokan_entry_requirement::models::QualificationProof",
          },
        ],
        outputs: [
          {
            type: "budokan_entry_requirement::models::QualificationEntries",
          },
        ],
        state_mutability: "view",
      },
    ],
  },
  {
    type: "impl",
    name: "PrizeImpl",
    interface_name: "budokan_interfaces::prize::IPrize",
  },
  {
    type: "interface",
    name: "budokan_interfaces::prize::IPrize",
    items: [
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
            type: "budokan_prize::models::Prize",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_total_prizes",
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
        name: "is_prize_claimed",
        inputs: [
          {
            name: "context_id",
            type: "core::integer::u64",
          },
          {
            name: "prize_type",
            type: "budokan_prize::models::PrizeType",
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
    name: "RegistrationImpl",
    interface_name: "budokan_interfaces::registration::IRegistration",
  },
  {
    type: "struct",
    name: "budokan_registration::models::Registration",
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
        name: "context_id",
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
      {
        name: "is_banned",
        type: "core::bool",
      },
    ],
  },
  {
    type: "interface",
    name: "budokan_interfaces::registration::IRegistration",
    items: [
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
            type: "budokan_registration::models::Registration",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "is_registration_banned",
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
            type: "core::bool",
          },
        ],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "get_context_id_for_token",
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
        name: "get_entry_count",
        inputs: [
          {
            name: "context_id",
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
        name: "registration_exists",
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
    inputs: [
      {
        name: "owner",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "default_token_address",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "event_relayer",
        type: "core::starknet::contract_address::ContractAddress",
      },
    ],
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
    name: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::TournamentConfigured",
    kind: "struct",
    members: [
      {
        name: "tournament_id",
        type: "core::integer::u64",
        kind: "key",
      },
      {
        name: "max_entries",
        type: "core::integer::u32",
        kind: "data",
      },
      {
        name: "ascending",
        type: "core::bool",
        kind: "data",
      },
      {
        name: "game_address",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::ScoreSubmitted",
    kind: "struct",
    members: [
      {
        name: "tournament_id",
        type: "core::integer::u64",
        kind: "key",
      },
      {
        name: "token_id",
        type: "core::integer::u64",
        kind: "key",
      },
      {
        name: "score",
        type: "core::integer::u32",
        kind: "data",
      },
      {
        name: "position",
        type: "core::integer::u8",
        kind: "data",
      },
    ],
  },
  {
    type: "event",
    name: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::LeaderboardCleared",
    kind: "struct",
    members: [
      {
        name: "tournament_id",
        type: "core::integer::u64",
        kind: "key",
      },
    ],
  },
  {
    type: "event",
    name: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::LeaderboardOwnershipTransferred",
    kind: "struct",
    members: [
      {
        name: "previous_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "new_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
    ],
  },
  {
    type: "event",
    name: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::Event",
    kind: "enum",
    variants: [
      {
        name: "TournamentConfigured",
        type: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::TournamentConfigured",
        kind: "nested",
      },
      {
        name: "ScoreSubmitted",
        type: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::ScoreSubmitted",
        kind: "nested",
      },
      {
        name: "LeaderboardCleared",
        type: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::LeaderboardCleared",
        kind: "nested",
      },
      {
        name: "LeaderboardOwnershipTransferred",
        type: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::LeaderboardOwnershipTransferred",
        kind: "nested",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferred",
    kind: "struct",
    members: [
      {
        name: "previous_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "new_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferStarted",
    kind: "struct",
    members: [
      {
        name: "previous_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
      {
        name: "new_owner",
        type: "core::starknet::contract_address::ContractAddress",
        kind: "key",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_access::ownable::ownable::OwnableComponent::Event",
    kind: "enum",
    variants: [
      {
        name: "OwnershipTransferred",
        type: "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferred",
        kind: "nested",
      },
      {
        name: "OwnershipTransferStarted",
        type: "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferStarted",
        kind: "nested",
      },
    ],
  },
  {
    type: "event",
    name: "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Upgraded",
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
    name: "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Event",
    kind: "enum",
    variants: [
      {
        name: "Upgraded",
        type: "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Upgraded",
        kind: "nested",
      },
    ],
  },
  {
    type: "event",
    name: "budokan_registration::registration::RegistrationComponent::Event",
    kind: "enum",
    variants: [],
  },
  {
    type: "event",
    name: "budokan_entry_fee::entry_fee::EntryFeeComponent::Event",
    kind: "enum",
    variants: [],
  },
  {
    type: "event",
    name: "budokan_entry_requirement::entry_requirement::EntryRequirementComponent::Event",
    kind: "enum",
    variants: [],
  },
  {
    type: "event",
    name: "budokan_prize::prize::PrizeComponent::Event",
    kind: "enum",
    variants: [],
  },
  {
    type: "event",
    name: "budokan::budokan::Budokan::Event",
    kind: "enum",
    variants: [
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
      {
        name: "LeaderboardEvent",
        type: "game_components_leaderboard::leaderboard_component::LeaderboardComponent::Event",
        kind: "flat",
      },
      {
        name: "OwnableEvent",
        type: "openzeppelin_access::ownable::ownable::OwnableComponent::Event",
        kind: "flat",
      },
      {
        name: "UpgradeableEvent",
        type: "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Event",
        kind: "flat",
      },
      {
        name: "RegistrationEvent",
        type: "budokan_registration::registration::RegistrationComponent::Event",
        kind: "flat",
      },
      {
        name: "EntryFeeEvent",
        type: "budokan_entry_fee::entry_fee::EntryFeeComponent::Event",
        kind: "flat",
      },
      {
        name: "EntryRequirementEvent",
        type: "budokan_entry_requirement::entry_requirement::EntryRequirementComponent::Event",
        kind: "flat",
      },
      {
        name: "PrizeEvent",
        type: "budokan_prize::prize::PrizeComponent::Event",
        kind: "flat",
      },
    ],
  },
];

export default BUDOKAN_ABI;
