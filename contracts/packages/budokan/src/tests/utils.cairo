use core::result::ResultTrait;
use starknet::ContractAddress;
use starknet::syscalls::deploy_syscall;

pub fn deploy(
    contract_class_hash: felt252, salt: felt252, calldata: Array<felt252>,
) -> ContractAddress {
    let (address, _) = deploy_syscall(
        contract_class_hash.try_into().unwrap(), salt, calldata.span(), false,
    )
        .unwrap();
    address
}
