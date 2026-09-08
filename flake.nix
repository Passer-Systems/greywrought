{
  description = "Greywrought native development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, rust-overlay, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ rust-overlay.overlays.default ];
      };
      rustToolchain = pkgs.rust-bin.fromRustupToolchainFile ./vendor/clause/rust-toolchain.toml;
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = [ rustToolchain pkgs.bun pkgs.pkg-config pkgs.libx11 pkgs.libxcursor pkgs.libxi pkgs.libxrandr pkgs.libxkbcommon pkgs.vulkan-loader ];
      };
    };
}
