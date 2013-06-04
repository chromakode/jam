url=http://localhost:8080/src/jam.html

run:
	if [ ! -z "`which google-chrome`" ]; then \
		google-chrome $(url); \
	elif [ `uname -s` = "Darwin" ]; then \
		open $(url); \
	fi
	python -m SimpleHTTPServer 8080
