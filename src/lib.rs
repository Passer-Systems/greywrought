#![forbid(unsafe_code)]

pub mod game;
pub mod persistence;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
