

import { useNavigate } from "react-router-dom";
import { userService } from '@/app/services/user.service';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Logout from '@mui/icons-material/Logout';
import { useState } from "react";
import PersonAddIcon from '@mui/icons-material/PersonAdd';

import { gravatar } from "@/app/shared/utils";

export default function Header(props: { isLogin: boolean, user?: any, main: boolean }) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const logout = () => {
    userService.logout();
    navigate('/login');
  }

  const invite = () => {
    navigate('/invite');
  }

  return (
    <header className="header _header-scroll _header-show">
      <div className="header__big-container">
        <div className="header__logo">
            <img src="/img/logo.svg" width={178} height={33} alt="log" />
        </div>
        <div className="header__menu menu">
          <button type="button" className="menu__icon icon-menu"><span></span></button>
          <nav className="menu__body">
            <ul className="menu__list">
              <li className="menu__item"><a href="/" className="menu__link">Home</a></li>
              <li className="menu__item"><a href="/developer" className="menu__link ">Developer</a></li>
              <li className="menu__item"><a href="https://www.smartloop.ai/docs/intro" target="_blank" className="menu__link ">Documentation</a></li>
            </ul>
          </nav>
        </div>
        {
          props.main ?
            props.user &&
              <div className="header__account header-account">
                <ul className="header-account__list">
                  <li className="header-account__item">
                    <details>
                      <summary className="header-account__arrow spollers__title _icon-arrow-right">
                        <div className="header-account__link flex gap-1 items-center">
                          <img src={gravatar(props.user)} alt={props.user.name} />
                          <button onClick={handleClick}>
                            {props.user.name ? props.user.name: "User" }
                          </button>
                        </div>
                        <div className="header-account__icon _icon-right-arrow"></div>
                      </summary>
                      <Menu
                          anchorEl={anchorEl}
                          id="account-menu"
                          open={open}
                          onClose={handleClose}
                          onClick={handleClose}
                          slotProps={{
                            paper: {
                              elevation: 0,
                              sx: {
                                overflow: 'visible',
                                filter: 'drop-shadow(0px 2px 0px rgba(0,0,0,0.32))',
                                mt: 1.5,
                                '& .MuiAvatar-root': {
                                  width: 32,
                                  height: 32,
                                  ml: -0.5,
                                  mr: 1,
                                },
                                '&::before': {
                                  content: '""',
                                  display: 'block',
                                  position: 'absolute',
                                  top: 0,
                                  right: 14,
                                  width: 10,
                                  height: 10,
                                  bgcolor: 'background.paper',
                                  transform: 'translateY(-50%) rotate(45deg)',
                                  zIndex: 0,
                                },
                              },
                            },
                          }}
                          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                        >
                          <MenuItem onClick={handleClose}>
                            <ListItemIcon>
                              <PersonAddIcon fontSize="small" />
                            </ListItemIcon>
                            <button onClick={invite}>Invite</button>
                          </MenuItem>
                          <MenuItem onClick={handleClose}>
                            <ListItemIcon>
                              <Logout fontSize="small" />
                            </ListItemIcon>
                            <button onClick={logout}>Logout</button>
                          </MenuItem>
                        </Menu>
                    </details>
                  </li>
                </ul>
              </div>
          : props.isLogin ?
          <div data-da=".menu__list,767.98" className="header__registration">
            <a href="/signup" className="header__sign">Sign Up</a>
          </div>
          : <div data-da=".menu__list,767.98" className="header__registration">
            <a href="/login" className="header__login">Login</a>
          </div>
        }
      </div>
    </header>
  )
}
