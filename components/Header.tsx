import React from "react";
import { CirclePlus, Plus } from "lucide-react";

type Props = {
  handleModal: any;
};

const Header = (props: Props) => {
  const { handleModal } = props;
  return (
    <header className="header">
      <div className="logo">Notes</div>
      {/* <div className="searchBox"></div> */}
      <button className="add-note__btn button__primary" onClick={handleModal}>
        <CirclePlus color="#fff" size={16} style={{ marginRight: 6 }} />
        Add new
      </button>
      <button className="add-note__fab button__primary" onClick={handleModal}>
        <span>
          <Plus color="#fff" size={18} />
        </span>
      </button>
    </header>
  );
};

export default Header;
