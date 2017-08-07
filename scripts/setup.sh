#!/bin/bash -e

set -e # exit on errors

# print a nicely formated header
function header {
  echo ""
  echo "$(tput setaf 6)$1$(tput sgr0)"
  echo ""
}
# return 1 if global command line program installed, else 0
# example
# echo "node: $(program_is_installed node)"
function program_is_installed {
  # set to 1 initially
  local return_=1
  # set to 0 if not found
  type $1 >/dev/null 2>&1 || { local return_=0; }
  # return value
  echo "$return_"
}

# test if all mandatory programs are installed
function test_all_mandatory_programs {
  missing_programs=()
  passed=true
  programs=('node' 'npm')
  elements=${#programs[@]}

  for ((i=0;i<$elements;i++)); do
    program=${programs[${i}]}
    status=$(program_is_installed ${program})
    if [ ${status} -eq 0 ] ; then
      missing_programs+=(${program})
      passed=false
    fi
  done

  if [ "$passed" = true ] ; then
    echo "passed"
  else
    echo "the following mandatory programs are not installed: ${missing_programs}"
    exit $1
  fi
}

function install_global_npm_packages {
  packages=('typescript' 'forever')
  elements=${#packages[@]}

  for ((i=0;i<$elements;i++)); do
    package=${packages[${i}]}
    status=$(program_is_installed ${package})
    if [ ${status} -eq 1 ] ; then
      echo "skipping package=${package} because it is already installed"
    else
      if [ ${package} = "coffee" ] ; then
        package="coffee-script"
      fi
      echo "installing package=${package}"
      npm install -g ${package}
    fi
  done
}
# return 1 if local npm package is installed at ./node_modules, else 0
# example
# echo "gruntacular : $(npm_package_is_installed gruntacular)"
function npm_package_is_installed {
  # set to 1 initially
  local return_=1
  # set to 0 if not found
  ls node_modules | grep $1 >/dev/null 2>&1 || { local return_=0; }
  # return value
  echo "$return_"
}

header "Testing if mandatory programs are installed..."
test_all_mandatory_programs

#header "Installing global npm packages"
#install_global_npm_packages

header "Installing local npm packages"
npm install
echo "done"

header "Compiling codebase"
tsc --project . || true

header "Creating Folders"
logFolder=($(cat conf/server.dev.json | jq -r '.paths.logPath'))
mkdir -p ${logFolder}
imageFolder=($(cat conf/server.dev.json | jq -r '.paths.filesPath'))
mkdir -p ${imageFolder}
jsonFolder=($(cat conf/server.dev.json | jq -r '.paths.jsonPath'))
mkdir -p ${jsonFolder}
logFolder=($(cat conf/server.dev.json | jq -r '.paths.logPath'))
mkdir -p ${logFolder}
ocropyLanguageModelsFolder=($(cat conf/server.dev.json | jq -r '.paths.ocropyLanguageModelsPath'))
mkdir -p ${ocropyLanguageModelsFolder}
executableFolder=($(cat conf/server.dev.json | jq -r '.paths.executablePath'))
mkdir -p ${executableFolder}
mkdir -p ${imageFolder}/test/original
resultsFolder=($(cat conf/server.dev.json | jq -r '.paths.resultsPath'))
mkdir -p ${resultsFolder}/

header "Creating Files"
imageInfoFile=($(cat conf/server.dev.json | jq -r '.paths.imageInfoFile'))
#md5 hash for this test image: https://placeholdit.imgix.net/~text?txtsize=33&txt=This%20is%20a%20test&w=1024&h=768
echo '[ {"md5":"1e5300b94a45423592a0f9011a63ba2a", "file":"/data/images/test/original/input0.jpg", "collection":"test"} ]' > ${imageInfoFile}
servicesInfoFile=($(cat conf/server.dev.json | jq -r '.paths.servicesInfoFile'))
echo '{"services":[]}' > ${servicesInfoFile}
rootInfoFile=($(cat conf/server.dev.json | jq -r '.paths.rootInfoFile'))
echo "[]" > ${rootInfoFile}
swaggerInfoFile=($(cat conf/server.dev.json | jq -r '.paths.swaggerFile'))
cp conf/swagger.json ${swaggerInfoFile}