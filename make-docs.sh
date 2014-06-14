#!/bin/bash

if ! which litjs >/dev/null
then
	echo "litjs not found in PATH"
	exit 1
fi

[ -d docs ] && rm -r -- docs/
mkdir docs

for JS in *.js
do
	DOC=${JS%.*}
	litjs <(sed -e 's/\t/  /g' < $JS) -o docs/$DOC.html -s callouts --title 'mysql-orm: '$JS 
done

cp -R /usr/local/lib/node_modules/lit/css docs/
