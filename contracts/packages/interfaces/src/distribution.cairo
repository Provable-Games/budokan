#[derive(Drop, Copy, Serde, PartialEq)]
pub enum Distribution {
    Linear: u16,
    Exponential: u16,
    Uniform,
    Custom: Span<u16>,
}
