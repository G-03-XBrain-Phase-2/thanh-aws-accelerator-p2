FROM busybox:1.36

COPY secret-reader.sh /usr/local/bin/secret-reader.sh
RUN chmod +x /usr/local/bin/secret-reader.sh

ENTRYPOINT ["/usr/local/bin/secret-reader.sh"]