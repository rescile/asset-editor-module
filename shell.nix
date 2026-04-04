#with ( import <nixpkgs> {});
#{ nodeEnv, fetchgit, pkgs ? import <nixpkgs> {} }:
{
  pkgs ? import <nixpkgs> { },
}:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs
    pkgs.npm-check-updates
    pkgs.zip
  ];

  shellHook = ''
    #export NODE_OPTIONS=--openssl-legacy-provider
    export PATH=$PWD/./node_modules/.bin:$PATH
  '';
}
