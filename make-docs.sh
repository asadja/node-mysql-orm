#!/bin/bash

if ! which litjs >/dev/null
then
	echo "litjs not found in PATH"
	exit 1
fi

rm docs/*.html

for JS in *.js
do
	DOC=${JS%.*}
	litjs $JS -o docs/$DOC.html -s callouts --title 'mysql-orm: '$JS 
done
