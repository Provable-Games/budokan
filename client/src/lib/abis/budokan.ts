const BUDOKAN_ABI = [
  {
    "type": "impl",
    "name": "UpgradeableImpl",
    "interface_name": "openzeppelin_interfaces::upgrades::IUpgradeable"
  },
  {
    "type": "interface",
    "name": "openzeppelin_interfaces::upgrades::IUpgradeable",
    "items": [
      {
        "type": "function",
        "name": "upgrade",
        "inputs": [
          {
            "name": "new_class_hash",
            "type": "core::starknet::class_hash::ClassHash"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      }
    ]
  },
  {
    "type": "impl",
    "name": "GameContextImpl",
    "interface_name": "game_components_interfaces::metagame::context::IMetagameContext"
  },
  {
    "type": "enum",
    "name": "core::bool",
    "variants": [
      {
        "name": "False",
        "type": "()"
      },
      {
        "name": "True",
        "type": "()"
      }
    ]
  },
  {
    "type": "interface",
    "name": "game_components_interfaces::metagame::context::IMetagameContext",
    "items": [
      {
        "type": "function",
        "name": "has_context",
        "inputs": [
          {
            "name": "token_id",
            "type": "core::felt252"
          }
        ],
        "outputs": [
          {
            "type": "core::bool"
          }
        ],
        "state_mutability": "view"
      }
    ]
  },
  {
    "type": "impl",
    "name": "GameContextDetailsImpl",
    "interface_name": "game_components_interfaces::metagame::context::IMetagameContextDetails"
  },
  {
    "type": "struct",
    "name": "core::byte_array::ByteArray",
    "members": [
      {
        "name": "data",
        "type": "core::array::Array::<core::bytes_31::bytes31>"
      },
      {
        "name": "pending_word",
        "type": "core::felt252"
      },
      {
        "name": "pending_word_len",
        "type": "core::internal::bounded_int::BoundedInt::<0, 30>"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<core::integer::u32>",
    "variants": [
      {
        "name": "Some",
        "type": "core::integer::u32"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<core::felt252>",
    "variants": [
      {
        "name": "Some",
        "type": "core::felt252"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::structs::metagame::GameContext",
    "members": [
      {
        "name": "name",
        "type": "core::byte_array::ByteArray"
      },
      {
        "name": "value",
        "type": "core::byte_array::ByteArray"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<game_components_interfaces::structs::metagame::GameContext>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<game_components_interfaces::structs::metagame::GameContext>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::structs::metagame::GameContextDetails",
    "members": [
      {
        "name": "name",
        "type": "core::byte_array::ByteArray"
      },
      {
        "name": "description",
        "type": "core::byte_array::ByteArray"
      },
      {
        "name": "id",
        "type": "core::option::Option::<core::integer::u32>"
      },
      {
        "name": "context",
        "type": "core::array::Span::<game_components_interfaces::structs::metagame::GameContext>"
      }
    ]
  },
  {
    "type": "interface",
    "name": "game_components_interfaces::metagame::context::IMetagameContextDetails",
    "items": [
      {
        "type": "function",
        "name": "context_details",
        "inputs": [
          {
            "name": "token_id",
            "type": "core::felt252"
          }
        ],
        "outputs": [
          {
            "type": "game_components_interfaces::structs::metagame::GameContextDetails"
          }
        ],
        "state_mutability": "view"
      }
    ]
  },
  {
    "type": "impl",
    "name": "BudokanImpl",
    "interface_name": "budokan_interfaces::budokan::IBudokan"
  },
  {
    "type": "struct",
    "name": "budokan_interfaces::budokan::Metadata",
    "members": [
      {
        "name": "name",
        "type": "core::felt252"
      },
      {
        "name": "description",
        "type": "core::byte_array::ByteArray"
      }
    ]
  },
  {
    "type": "struct",
    "name": "budokan_interfaces::budokan::Schedule",
    "members": [
      {
        "name": "registration_start_delay",
        "type": "core::integer::u32"
      },
      {
        "name": "registration_end_delay",
        "type": "core::integer::u32"
      },
      {
        "name": "game_start_delay",
        "type": "core::integer::u32"
      },
      {
        "name": "game_end_delay",
        "type": "core::integer::u32"
      },
      {
        "name": "submission_duration",
        "type": "core::integer::u32"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<core::byte_array::ByteArray>",
    "variants": [
      {
        "name": "Some",
        "type": "core::byte_array::ByteArray"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<core::starknet::contract_address::ContractAddress>",
    "variants": [
      {
        "name": "Some",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "budokan_interfaces::budokan::GameConfig",
    "members": [
      {
        "name": "game_address",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "settings_id",
        "type": "core::integer::u32"
      },
      {
        "name": "soulbound",
        "type": "core::bool"
      },
      {
        "name": "paymaster",
        "type": "core::bool"
      },
      {
        "name": "client_url",
        "type": "core::option::Option::<core::byte_array::ByteArray>"
      },
      {
        "name": "renderer",
        "type": "core::option::Option::<core::starknet::contract_address::ContractAddress>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<core::integer::u16>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<core::integer::u16>"
      }
    ]
  },
  {
    "type": "enum",
    "name": "game_components_interfaces::distribution::Distribution",
    "variants": [
      {
        "name": "Linear",
        "type": "core::integer::u16"
      },
      {
        "name": "Exponential",
        "type": "core::integer::u16"
      },
      {
        "name": "Uniform",
        "type": "()"
      },
      {
        "name": "Custom",
        "type": "core::array::Span::<core::integer::u16>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "budokan_interfaces::budokan::EntryFee",
    "members": [
      {
        "name": "token_address",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "amount",
        "type": "core::integer::u128"
      },
      {
        "name": "tournament_creator_share",
        "type": "core::integer::u16"
      },
      {
        "name": "game_creator_share",
        "type": "core::integer::u16"
      },
      {
        "name": "refund_share",
        "type": "core::integer::u16"
      },
      {
        "name": "distribution",
        "type": "game_components_interfaces::distribution::Distribution"
      },
      {
        "name": "distribution_count",
        "type": "core::integer::u32"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<budokan_interfaces::budokan::EntryFee>",
    "variants": [
      {
        "name": "Some",
        "type": "budokan_interfaces::budokan::EntryFee"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<core::starknet::contract_address::ContractAddress>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<core::starknet::contract_address::ContractAddress>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<core::felt252>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<core::felt252>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "interfaces::extension::ExtensionConfig",
    "members": [
      {
        "name": "address",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "config",
        "type": "core::array::Span::<core::felt252>"
      }
    ]
  },
  {
    "type": "enum",
    "name": "game_components_interfaces::entry_requirement::EntryRequirementType",
    "variants": [
      {
        "name": "token",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "extension",
        "type": "interfaces::extension::ExtensionConfig"
      }
    ]
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::entry_requirement::EntryRequirement",
    "members": [
      {
        "name": "entry_limit",
        "type": "core::integer::u32"
      },
      {
        "name": "entry_requirement_type",
        "type": "game_components_interfaces::entry_requirement::EntryRequirementType"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<game_components_interfaces::entry_requirement::EntryRequirement>",
    "variants": [
      {
        "name": "Some",
        "type": "game_components_interfaces::entry_requirement::EntryRequirement"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "budokan_interfaces::budokan::LeaderboardConfig",
    "members": [
      {
        "name": "ascending",
        "type": "core::bool"
      },
      {
        "name": "game_must_be_over",
        "type": "core::bool"
      }
    ]
  },
  {
    "type": "struct",
    "name": "budokan_interfaces::budokan::Tournament",
    "members": [
      {
        "name": "id",
        "type": "core::integer::u64"
      },
      {
        "name": "created_at",
        "type": "core::integer::u64"
      },
      {
        "name": "created_by",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "creator_token_id",
        "type": "core::felt252"
      },
      {
        "name": "metadata",
        "type": "budokan_interfaces::budokan::Metadata"
      },
      {
        "name": "schedule",
        "type": "budokan_interfaces::budokan::Schedule"
      },
      {
        "name": "game_config",
        "type": "budokan_interfaces::budokan::GameConfig"
      },
      {
        "name": "entry_fee",
        "type": "core::option::Option::<budokan_interfaces::budokan::EntryFee>"
      },
      {
        "name": "entry_requirement",
        "type": "core::option::Option::<game_components_interfaces::entry_requirement::EntryRequirement>"
      },
      {
        "name": "leaderboard_config",
        "type": "budokan_interfaces::budokan::LeaderboardConfig"
      }
    ]
  },
  {
    "type": "enum",
    "name": "budokan_interfaces::budokan::Phase",
    "variants": [
      {
        "name": "Scheduled",
        "type": "()"
      },
      {
        "name": "Registration",
        "type": "()"
      },
      {
        "name": "Staging",
        "type": "()"
      },
      {
        "name": "Live",
        "type": "()"
      },
      {
        "name": "Submission",
        "type": "()"
      },
      {
        "name": "Finalized",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::integer::u256",
    "members": [
      {
        "name": "low",
        "type": "core::integer::u128"
      },
      {
        "name": "high",
        "type": "core::integer::u128"
      }
    ]
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::entry_requirement::NFTQualification",
    "members": [
      {
        "name": "token_id",
        "type": "core::integer::u256"
      }
    ]
  },
  {
    "type": "enum",
    "name": "game_components_interfaces::entry_requirement::QualificationProof",
    "variants": [
      {
        "name": "NFT",
        "type": "game_components_interfaces::entry_requirement::NFTQualification"
      },
      {
        "name": "Extension",
        "type": "core::array::Span::<core::felt252>"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<game_components_interfaces::entry_requirement::QualificationProof>",
    "variants": [
      {
        "name": "Some",
        "type": "game_components_interfaces::entry_requirement::QualificationProof"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "enum",
    "name": "game_components_interfaces::prize::PrizeType",
    "variants": [
      {
        "name": "Single",
        "type": "core::integer::u64"
      },
      {
        "name": "Distributed",
        "type": "(core::integer::u64, core::integer::u32)"
      }
    ]
  },
  {
    "type": "enum",
    "name": "budokan_interfaces::budokan::EntryFeeRewardType",
    "variants": [
      {
        "name": "Position",
        "type": "core::integer::u32"
      },
      {
        "name": "TournamentCreator",
        "type": "()"
      },
      {
        "name": "GameCreator",
        "type": "()"
      },
      {
        "name": "Refund",
        "type": "core::felt252"
      }
    ]
  },
  {
    "type": "enum",
    "name": "budokan_interfaces::budokan::RewardType",
    "variants": [
      {
        "name": "Prize",
        "type": "game_components_interfaces::prize::PrizeType"
      },
      {
        "name": "EntryFee",
        "type": "budokan_interfaces::budokan::EntryFeeRewardType"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<game_components_interfaces::distribution::Distribution>",
    "variants": [
      {
        "name": "Some",
        "type": "game_components_interfaces::distribution::Distribution"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::prize::ERC20Data",
    "members": [
      {
        "name": "amount",
        "type": "core::integer::u128"
      },
      {
        "name": "distribution",
        "type": "core::option::Option::<game_components_interfaces::distribution::Distribution>"
      },
      {
        "name": "distribution_count",
        "type": "core::option::Option::<core::integer::u32>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::prize::ERC721Data",
    "members": [
      {
        "name": "id",
        "type": "core::integer::u128"
      }
    ]
  },
  {
    "type": "enum",
    "name": "game_components_interfaces::prize::TokenTypeData",
    "variants": [
      {
        "name": "erc20",
        "type": "game_components_interfaces::prize::ERC20Data"
      },
      {
        "name": "erc721",
        "type": "game_components_interfaces::prize::ERC721Data"
      }
    ]
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::prize::PrizeData",
    "members": [
      {
        "name": "id",
        "type": "core::integer::u64"
      },
      {
        "name": "context_id",
        "type": "core::integer::u64"
      },
      {
        "name": "token_address",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "token_type",
        "type": "game_components_interfaces::prize::TokenTypeData"
      },
      {
        "name": "sponsor_address",
        "type": "core::starknet::contract_address::ContractAddress"
      }
    ]
  },
  {
    "type": "interface",
    "name": "budokan_interfaces::budokan::IBudokan",
    "items": [
      {
        "type": "function",
        "name": "total_tournaments",
        "inputs": [],
        "outputs": [
          {
            "type": "core::integer::u64"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "tournament",
        "inputs": [
          {
            "name": "tournament_id",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "budokan_interfaces::budokan::Tournament"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "tournament_entries",
        "inputs": [
          {
            "name": "tournament_id",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "core::integer::u32"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "get_leaderboard",
        "inputs": [
          {
            "name": "tournament_id",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "core::array::Array::<core::felt252>"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "current_phase",
        "inputs": [
          {
            "name": "tournament_id",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "budokan_interfaces::budokan::Phase"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "create_tournament",
        "inputs": [
          {
            "name": "creator_rewards_address",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "metadata",
            "type": "budokan_interfaces::budokan::Metadata"
          },
          {
            "name": "schedule",
            "type": "budokan_interfaces::budokan::Schedule"
          },
          {
            "name": "game_config",
            "type": "budokan_interfaces::budokan::GameConfig"
          },
          {
            "name": "entry_fee",
            "type": "core::option::Option::<budokan_interfaces::budokan::EntryFee>"
          },
          {
            "name": "entry_requirement",
            "type": "core::option::Option::<game_components_interfaces::entry_requirement::EntryRequirement>"
          },
          {
            "name": "leaderboard_config",
            "type": "budokan_interfaces::budokan::LeaderboardConfig"
          },
          {
            "name": "salt",
            "type": "core::integer::u16"
          },
          {
            "name": "metadata_value",
            "type": "core::integer::u16"
          }
        ],
        "outputs": [
          {
            "type": "budokan_interfaces::budokan::Tournament"
          }
        ],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "enter_tournament",
        "inputs": [
          {
            "name": "tournament_id",
            "type": "core::integer::u64"
          },
          {
            "name": "player_name",
            "type": "core::option::Option::<core::felt252>"
          },
          {
            "name": "player_address",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "qualification",
            "type": "core::option::Option::<game_components_interfaces::entry_requirement::QualificationProof>"
          },
          {
            "name": "salt",
            "type": "core::integer::u16"
          },
          {
            "name": "metadata_value",
            "type": "core::integer::u16"
          }
        ],
        "outputs": [
          {
            "type": "(core::felt252, core::integer::u32)"
          }
        ],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "ban_entry",
        "inputs": [
          {
            "name": "tournament_id",
            "type": "core::integer::u64"
          },
          {
            "name": "game_token_id",
            "type": "core::felt252"
          },
          {
            "name": "proof",
            "type": "core::array::Span::<core::felt252>"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "submit_score",
        "inputs": [
          {
            "name": "tournament_id",
            "type": "core::integer::u64"
          },
          {
            "name": "token_id",
            "type": "core::felt252"
          },
          {
            "name": "position",
            "type": "core::integer::u32"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "claim_reward",
        "inputs": [
          {
            "name": "tournament_id",
            "type": "core::integer::u64"
          },
          {
            "name": "reward_type",
            "type": "budokan_interfaces::budokan::RewardType"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "add_prize",
        "inputs": [
          {
            "name": "tournament_id",
            "type": "core::integer::u64"
          },
          {
            "name": "token_address",
            "type": "core::starknet::contract_address::ContractAddress"
          },
          {
            "name": "token_type",
            "type": "game_components_interfaces::prize::TokenTypeData"
          },
          {
            "name": "position",
            "type": "core::option::Option::<core::integer::u32>"
          }
        ],
        "outputs": [
          {
            "type": "game_components_interfaces::prize::PrizeData"
          }
        ],
        "state_mutability": "external"
      }
    ]
  },
  {
    "type": "impl",
    "name": "MetagameImpl",
    "interface_name": "game_components_interfaces::metagame::core::IMetagame"
  },
  {
    "type": "interface",
    "name": "game_components_interfaces::metagame::core::IMetagame",
    "items": [
      {
        "type": "function",
        "name": "context_address",
        "inputs": [],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "default_token_address",
        "inputs": [],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      }
    ]
  },
  {
    "type": "impl",
    "name": "SRC5Impl",
    "interface_name": "openzeppelin_interfaces::introspection::ISRC5"
  },
  {
    "type": "interface",
    "name": "openzeppelin_interfaces::introspection::ISRC5",
    "items": [
      {
        "type": "function",
        "name": "supports_interface",
        "inputs": [
          {
            "name": "interface_id",
            "type": "core::felt252"
          }
        ],
        "outputs": [
          {
            "type": "core::bool"
          }
        ],
        "state_mutability": "view"
      }
    ]
  },
  {
    "type": "impl",
    "name": "OwnableImpl",
    "interface_name": "openzeppelin_interfaces::access::ownable::IOwnable"
  },
  {
    "type": "interface",
    "name": "openzeppelin_interfaces::access::ownable::IOwnable",
    "items": [
      {
        "type": "function",
        "name": "owner",
        "inputs": [],
        "outputs": [
          {
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "transfer_ownership",
        "inputs": [
          {
            "name": "new_owner",
            "type": "core::starknet::contract_address::ContractAddress"
          }
        ],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "type": "function",
        "name": "renounce_ownership",
        "inputs": [],
        "outputs": [],
        "state_mutability": "external"
      }
    ]
  },
  {
    "type": "impl",
    "name": "EntryFeeImpl",
    "interface_name": "game_components_interfaces::entry_fee::IEntryFee"
  },
  {
    "type": "enum",
    "name": "core::option::Option::<core::integer::u16>",
    "variants": [
      {
        "name": "Some",
        "type": "core::integer::u16"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::entry_fee::AdditionalShare",
    "members": [
      {
        "name": "recipient",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "share_bps",
        "type": "core::integer::u16"
      }
    ]
  },
  {
    "type": "struct",
    "name": "core::array::Span::<game_components_interfaces::entry_fee::AdditionalShare>",
    "members": [
      {
        "name": "snapshot",
        "type": "@core::array::Array::<game_components_interfaces::entry_fee::AdditionalShare>"
      }
    ]
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::entry_fee::EntryFeeConfig",
    "members": [
      {
        "name": "token_address",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "amount",
        "type": "core::integer::u128"
      },
      {
        "name": "game_creator_share",
        "type": "core::option::Option::<core::integer::u16>"
      },
      {
        "name": "refund_share",
        "type": "core::option::Option::<core::integer::u16>"
      },
      {
        "name": "additional_shares",
        "type": "core::array::Span::<game_components_interfaces::entry_fee::AdditionalShare>"
      }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<game_components_interfaces::entry_fee::EntryFeeConfig>",
    "variants": [
      {
        "name": "Some",
        "type": "game_components_interfaces::entry_fee::EntryFeeConfig"
      },
      {
        "name": "None",
        "type": "()"
      }
    ]
  },
  {
    "type": "interface",
    "name": "game_components_interfaces::entry_fee::IEntryFee",
    "items": [
      {
        "type": "function",
        "name": "get_entry_fee",
        "inputs": [
          {
            "name": "context_id",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "core::option::Option::<game_components_interfaces::entry_fee::EntryFeeConfig>"
          }
        ],
        "state_mutability": "view"
      }
    ]
  },
  {
    "type": "impl",
    "name": "EntryRequirementImpl",
    "interface_name": "game_components_interfaces::entry_requirement::IEntryRequirement"
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::entry_requirement::QualificationEntries",
    "members": [
      {
        "name": "context_id",
        "type": "core::integer::u64"
      },
      {
        "name": "qualification_proof",
        "type": "game_components_interfaces::entry_requirement::QualificationProof"
      },
      {
        "name": "entry_count",
        "type": "core::integer::u32"
      }
    ]
  },
  {
    "type": "interface",
    "name": "game_components_interfaces::entry_requirement::IEntryRequirement",
    "items": [
      {
        "type": "function",
        "name": "get_entry_requirement",
        "inputs": [
          {
            "name": "context_id",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "core::option::Option::<game_components_interfaces::entry_requirement::EntryRequirement>"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "get_qualification_entries",
        "inputs": [
          {
            "name": "context_id",
            "type": "core::integer::u64"
          },
          {
            "name": "proof",
            "type": "game_components_interfaces::entry_requirement::QualificationProof"
          }
        ],
        "outputs": [
          {
            "type": "game_components_interfaces::entry_requirement::QualificationEntries"
          }
        ],
        "state_mutability": "view"
      }
    ]
  },
  {
    "type": "impl",
    "name": "PrizeImpl",
    "interface_name": "game_components_interfaces::prize::IPrize"
  },
  {
    "type": "interface",
    "name": "game_components_interfaces::prize::IPrize",
    "items": [
      {
        "type": "function",
        "name": "get_prize",
        "inputs": [
          {
            "name": "prize_id",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "game_components_interfaces::prize::PrizeData"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "get_total_prizes",
        "inputs": [],
        "outputs": [
          {
            "type": "core::integer::u64"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "is_prize_claimed",
        "inputs": [
          {
            "name": "context_id",
            "type": "core::integer::u64"
          },
          {
            "name": "prize_type",
            "type": "game_components_interfaces::prize::PrizeType"
          }
        ],
        "outputs": [
          {
            "type": "core::bool"
          }
        ],
        "state_mutability": "view"
      }
    ]
  },
  {
    "type": "impl",
    "name": "RegistrationImpl",
    "interface_name": "game_components_interfaces::registration::IRegistration"
  },
  {
    "type": "struct",
    "name": "game_components_interfaces::registration::Registration",
    "members": [
      {
        "name": "context_id",
        "type": "core::integer::u64"
      },
      {
        "name": "entry_id",
        "type": "core::integer::u32"
      },
      {
        "name": "game_token_id",
        "type": "core::felt252"
      },
      {
        "name": "has_submitted",
        "type": "core::bool"
      },
      {
        "name": "is_banned",
        "type": "core::bool"
      }
    ]
  },
  {
    "type": "interface",
    "name": "game_components_interfaces::registration::IRegistration",
    "items": [
      {
        "type": "function",
        "name": "get_entry",
        "inputs": [
          {
            "name": "context_id",
            "type": "core::integer::u64"
          },
          {
            "name": "entry_id",
            "type": "core::integer::u32"
          }
        ],
        "outputs": [
          {
            "type": "game_components_interfaces::registration::Registration"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "entry_exists",
        "inputs": [
          {
            "name": "context_id",
            "type": "core::integer::u64"
          },
          {
            "name": "entry_id",
            "type": "core::integer::u32"
          }
        ],
        "outputs": [
          {
            "type": "core::bool"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "is_entry_banned",
        "inputs": [
          {
            "name": "context_id",
            "type": "core::integer::u64"
          },
          {
            "name": "entry_id",
            "type": "core::integer::u32"
          }
        ],
        "outputs": [
          {
            "type": "core::bool"
          }
        ],
        "state_mutability": "view"
      },
      {
        "type": "function",
        "name": "get_entry_count",
        "inputs": [
          {
            "name": "context_id",
            "type": "core::integer::u64"
          }
        ],
        "outputs": [
          {
            "type": "core::integer::u32"
          }
        ],
        "state_mutability": "view"
      }
    ]
  },
  {
    "type": "constructor",
    "name": "constructor",
    "inputs": [
      {
        "name": "owner",
        "type": "core::starknet::contract_address::ContractAddress"
      },
      {
        "name": "default_token_address",
        "type": "core::starknet::contract_address::ContractAddress"
      }
    ]
  },
  {
    "type": "event",
    "name": "game_components_embeddable_game_standard::metagame::metagame_component::MetagameComponent::Event",
    "kind": "enum",
    "variants": []
  },
  {
    "type": "event",
    "name": "game_components_embeddable_game_standard::metagame::extensions::context::context::ContextComponent::Event",
    "kind": "enum",
    "variants": []
  },
  {
    "type": "event",
    "name": "openzeppelin_introspection::src5::SRC5Component::Event",
    "kind": "enum",
    "variants": []
  },
  {
    "type": "event",
    "name": "game_components_metagame::leaderboard::leaderboard_component::LeaderboardComponent::Event",
    "kind": "enum",
    "variants": []
  },
  {
    "type": "event",
    "name": "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferred",
    "kind": "struct",
    "members": [
      {
        "name": "previous_owner",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "new_owner",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      }
    ]
  },
  {
    "type": "event",
    "name": "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferStarted",
    "kind": "struct",
    "members": [
      {
        "name": "previous_owner",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "new_owner",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      }
    ]
  },
  {
    "type": "event",
    "name": "openzeppelin_access::ownable::ownable::OwnableComponent::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "OwnershipTransferred",
        "type": "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferred",
        "kind": "nested"
      },
      {
        "name": "OwnershipTransferStarted",
        "type": "openzeppelin_access::ownable::ownable::OwnableComponent::OwnershipTransferStarted",
        "kind": "nested"
      }
    ]
  },
  {
    "type": "event",
    "name": "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Upgraded",
    "kind": "struct",
    "members": [
      {
        "name": "class_hash",
        "type": "core::starknet::class_hash::ClassHash",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "Upgraded",
        "type": "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Upgraded",
        "kind": "nested"
      }
    ]
  },
  {
    "type": "event",
    "name": "game_components_metagame::registration::registration_component::RegistrationComponent::Event",
    "kind": "enum",
    "variants": []
  },
  {
    "type": "event",
    "name": "game_components_metagame::entry_fee::entry_fee_component::EntryFeeComponent::Event",
    "kind": "enum",
    "variants": []
  },
  {
    "type": "event",
    "name": "game_components_metagame::entry_requirement::entry_requirement_component::EntryRequirementComponent::Event",
    "kind": "enum",
    "variants": []
  },
  {
    "type": "event",
    "name": "game_components_metagame::prize::prize_component::PrizeComponent::Event",
    "kind": "enum",
    "variants": []
  },
  {
    "type": "event",
    "name": "budokan::events::TournamentCreated",
    "kind": "struct",
    "members": [
      {
        "name": "tournament_id",
        "type": "core::integer::u64",
        "kind": "key"
      },
      {
        "name": "game_address",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "key"
      },
      {
        "name": "created_at",
        "type": "core::integer::u64",
        "kind": "data"
      },
      {
        "name": "created_by",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "creator_token_id",
        "type": "core::felt252",
        "kind": "data"
      },
      {
        "name": "metadata",
        "type": "budokan_interfaces::budokan::Metadata",
        "kind": "data"
      },
      {
        "name": "schedule",
        "type": "budokan_interfaces::budokan::Schedule",
        "kind": "data"
      },
      {
        "name": "game_config",
        "type": "budokan_interfaces::budokan::GameConfig",
        "kind": "data"
      },
      {
        "name": "entry_fee",
        "type": "core::option::Option::<budokan_interfaces::budokan::EntryFee>",
        "kind": "data"
      },
      {
        "name": "entry_requirement",
        "type": "core::option::Option::<game_components_interfaces::entry_requirement::EntryRequirement>",
        "kind": "data"
      },
      {
        "name": "leaderboard_config",
        "type": "budokan_interfaces::budokan::LeaderboardConfig",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "budokan::events::TournamentRegistration",
    "kind": "struct",
    "members": [
      {
        "name": "tournament_id",
        "type": "core::integer::u64",
        "kind": "key"
      },
      {
        "name": "game_token_id",
        "type": "core::felt252",
        "kind": "key"
      },
      {
        "name": "game_address",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "player_address",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "entry_number",
        "type": "core::integer::u32",
        "kind": "data"
      },
      {
        "name": "has_submitted",
        "type": "core::bool",
        "kind": "data"
      },
      {
        "name": "is_banned",
        "type": "core::bool",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "budokan::events::LeaderboardUpdated",
    "kind": "struct",
    "members": [
      {
        "name": "tournament_id",
        "type": "core::integer::u64",
        "kind": "key"
      },
      {
        "name": "token_ids",
        "type": "core::array::Span::<core::felt252>",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "budokan::events::PrizeAdded",
    "kind": "struct",
    "members": [
      {
        "name": "tournament_id",
        "type": "core::integer::u64",
        "kind": "key"
      },
      {
        "name": "prize_id",
        "type": "core::integer::u64",
        "kind": "key"
      },
      {
        "name": "payout_position",
        "type": "core::integer::u32",
        "kind": "data"
      },
      {
        "name": "token_address",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      },
      {
        "name": "token_type",
        "type": "game_components_interfaces::prize::TokenTypeData",
        "kind": "data"
      },
      {
        "name": "sponsor_address",
        "type": "core::starknet::contract_address::ContractAddress",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "budokan::events::RewardClaimed",
    "kind": "struct",
    "members": [
      {
        "name": "tournament_id",
        "type": "core::integer::u64",
        "kind": "key"
      },
      {
        "name": "reward_type",
        "type": "budokan_interfaces::budokan::RewardType",
        "kind": "data"
      },
      {
        "name": "claimed",
        "type": "core::bool",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "budokan::events::QualificationEntriesUpdated",
    "kind": "struct",
    "members": [
      {
        "name": "tournament_id",
        "type": "core::integer::u64",
        "kind": "key"
      },
      {
        "name": "qualification_proof",
        "type": "game_components_interfaces::entry_requirement::QualificationProof",
        "kind": "data"
      },
      {
        "name": "entry_count",
        "type": "core::integer::u32",
        "kind": "data"
      }
    ]
  },
  {
    "type": "event",
    "name": "budokan::budokan::Budokan::Event",
    "kind": "enum",
    "variants": [
      {
        "name": "MetagameEvent",
        "type": "game_components_embeddable_game_standard::metagame::metagame_component::MetagameComponent::Event",
        "kind": "flat"
      },
      {
        "name": "ContextEvent",
        "type": "game_components_embeddable_game_standard::metagame::extensions::context::context::ContextComponent::Event",
        "kind": "flat"
      },
      {
        "name": "SRC5Event",
        "type": "openzeppelin_introspection::src5::SRC5Component::Event",
        "kind": "flat"
      },
      {
        "name": "LeaderboardEvent",
        "type": "game_components_metagame::leaderboard::leaderboard_component::LeaderboardComponent::Event",
        "kind": "flat"
      },
      {
        "name": "OwnableEvent",
        "type": "openzeppelin_access::ownable::ownable::OwnableComponent::Event",
        "kind": "flat"
      },
      {
        "name": "UpgradeableEvent",
        "type": "openzeppelin_upgrades::upgradeable::UpgradeableComponent::Event",
        "kind": "flat"
      },
      {
        "name": "RegistrationEvent",
        "type": "game_components_metagame::registration::registration_component::RegistrationComponent::Event",
        "kind": "flat"
      },
      {
        "name": "EntryFeeEvent",
        "type": "game_components_metagame::entry_fee::entry_fee_component::EntryFeeComponent::Event",
        "kind": "flat"
      },
      {
        "name": "EntryRequirementEvent",
        "type": "game_components_metagame::entry_requirement::entry_requirement_component::EntryRequirementComponent::Event",
        "kind": "flat"
      },
      {
        "name": "PrizeEvent",
        "type": "game_components_metagame::prize::prize_component::PrizeComponent::Event",
        "kind": "flat"
      },
      {
        "name": "TournamentCreated",
        "type": "budokan::events::TournamentCreated",
        "kind": "nested"
      },
      {
        "name": "TournamentRegistration",
        "type": "budokan::events::TournamentRegistration",
        "kind": "nested"
      },
      {
        "name": "LeaderboardUpdated",
        "type": "budokan::events::LeaderboardUpdated",
        "kind": "nested"
      },
      {
        "name": "PrizeAdded",
        "type": "budokan::events::PrizeAdded",
        "kind": "nested"
      },
      {
        "name": "RewardClaimed",
        "type": "budokan::events::RewardClaimed",
        "kind": "nested"
      },
      {
        "name": "QualificationEntriesUpdated",
        "type": "budokan::events::QualificationEntriesUpdated",
        "kind": "nested"
      }
    ]
  }
];export default BUDOKAN_ABI;