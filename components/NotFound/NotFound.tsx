import React, { useEffect, useState } from "react";
import styles from "./NotFound.module.css";
import Image from "next/image";
import NoNotesIcon from "../../assets/no_notes.svg";

type Props = {
  text?: string;
};

const NotFound = (props: Props) => {
  const { text = "Not Found" } = props;
  const [showImage, setShowImage] = useState(false);

  useEffect(() => {
    setShowImage(true);
  }, []);

  return (
    <div className={styles.root}>
      {showImage && (
        <Image
          src={NoNotesIcon}
          alt="Notes by nine.technology"
        />
      )}
      <p>{text}</p>
    </div>
  );
};

export default NotFound;
