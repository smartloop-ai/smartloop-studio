
import { useState } from 'react';

import { FileUpload, FileUploadHeaderTemplateOptions, ItemTemplateOptions } from 'primereact/fileupload';
import { IconButton } from '@mui/material';

import CloseIcon from '@mui/icons-material/Close';

export default function DocumentUpload(props: { onUpload: any }) {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const onFileSelect = (e: any) => {
        const file = e.files[0];
        const fileSize = file.size;
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv', 'application/vnd.ms-excel', 'text/markdown'];

        if (!allowedTypes.includes(file.type) && !/\.md$/i.test(file.name)) {
            console.error(`Invalid file type selected: ${file.type}`);
            setErrorMessage('Invalid file type selected. Supported types: pdf, docx, txt, csv, md.');
            props.onUpload([]);
            return;
        }

        if (fileSize > 50000000) {
            setErrorMessage('File size exceeds the maximum limit of 50 MB.');
            props.onUpload([]);
            return;
        }

        setErrorMessage(null); // Clear error message if file is valid
        props.onUpload([file]);
    };

	const onUpload = (e: any) => {
		if (e.xhr.status === 200) {
			JSON.parse(e.xhr.response);
		}
	}

	const headerTemplate = (options: FileUploadHeaderTemplateOptions) => {
		const chooseButton = options.chooseButton;

		return (<>
			<h3 className="popup__subtitle">Choose a Document</h3>
			<div className="popup__text">
				<p>Supported Types (pdf, docx, txt, csv)</p>
			</div>
			<div className='popup__upload _icon-addition'>
				{chooseButton}
			</div>

		</>)
	}

    const itemTemplate = (inFile: object, props: ItemTemplateOptions) => {
        const file = inFile as File;

        return (
            <div className="flex my-5 popup__drop break-words">
                <div className="flex items-center">
                    <div>
                        {file.name}
                    </div>
                    <IconButton
                        aria-label="close"
                        onClick={(e) => props.onRemove(e)}
                    >
                        <CloseIcon className='text-red-300' />
                    </IconButton>
                </div>
            </div>
        );
    };

    const documentUploadHandler = (files: any) => {
        const [file] = files;
        const fileReader = new FileReader();
        fileReader.onload = (e: any) => {
            props.onUpload(e.target.result);
        };
        fileReader.readAsDataURL(file);
    };

    return (<>
        {errorMessage && (
            <div className="text-red-500 mb-4">
                {errorMessage}
            </div>
        )}
        <FileUpload
            name="file"
            accept=".pdf,.docx,.txt,.csv,.md"
            onSelect={onFileSelect}
            maxFileSize={5000000}
            invalidFileSizeMessageSummary='Invalid file size. '
            invalidFileSizeMessageDetail="Maximum allowed upload file size is 5 MB. Supported types: pdf, docx, txt, csv."
            headerTemplate={headerTemplate}
            customUpload={true}
            uploadHandler={documentUploadHandler}
            itemTemplate={itemTemplate}
            emptyTemplate={
                <div className="popup__drop">
                    <div className="popup__drop-icon _icon-text-document"></div>
                    <div className="popup__drop-text">Drop a file here</div>
                </div>
            }
            onUpload={onUpload}
        />
    </>);
}
