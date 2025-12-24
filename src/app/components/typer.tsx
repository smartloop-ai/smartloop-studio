import {  useEffect, useState } from "react";
import  Cursor from '@/app/components/cursor';

export default function Typer(props: {key: string, message: { payload: { is_new: boolean,  text: string, uid: string }, direction: any, } }) {
	const [displayResponse, setDisplayResponse] = useState("");
	const [completedTyping, setCompletedTyping] = useState(false);

	useEffect(() => {
		let message = props.message.payload.text;

		let i = 0;

		const intervalId = setInterval(() => {
		  setDisplayResponse(message.slice(0, i));
	
		  i++;
	
		  if (i > message.length) {
			clearInterval(intervalId);
			setCompletedTyping(true);
			props.message.payload.is_new  = false;
		  }
		}, 20);
	
		return () => clearInterval(intervalId);
	  }, [props.key]);

	return (
		<>
			<span className="whitespace-pre-line">
				{displayResponse}
				{!completedTyping && <Cursor />}
			</span>
		</>
	);
  }