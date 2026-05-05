// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title IExpenseManager
 * @dev Giao dien toi thieu de SharedVault tuong tac voi ExpenseManager.
 */
interface IExpenseManager {
    function validateTransaction(uint256 categoryId, uint256 amount) external returns (bool);
}

/**
 * @title SharedVault
 * @dev Kien truc phan quyen moi: System Admin (Off-chain), Owner, Member, Contributor.
 */
contract SharedVault is Initializable, EIP712Upgradeable, ReentrancyGuard {
    using ECDSA for bytes32;

    // --- CÁC VAI TRÒ (ROLES) ---
    
    // 1. Owner: Nguoi tao quy, co dac quyen bat buoc phai ky ten khi dong quy
    address public owner;
    
    // 2. Member: Thanh vien co quyen bieu quyet (thay the cho Admin cu)
    address[] public members;
    mapping(address => bool) public isMember;
    uint256 public activeMemberCount;
    
    uint256 public threshold;

    // --- CÁC TRẠNG THÁI (STATES) ---
    enum VaultState { Created, Active, Locked, Closed }
    VaultState public state;
    
    // Chong tan cong phat lai (Replay Attack)
    mapping(uint256 => bool) public executedNonces;

    // --- TICH HOP EXPENSE MANAGER ---
    // Hop dong quan ly han muc chi tieu (optional — co the = address(0))
    IExpenseManager public expenseManager;

    // Cau truc Hash theo chuan EIP-712
    // Luu y: categoryId duoc them vao de dam bao tinh toan ven EIP-712
    bytes32 public constant WITHDRAW_TYPEHASH = keccak256(
        "WithdrawRequest(address to,uint256 amount,uint256 categoryId,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant CLOSE_FUND_TYPEHASH = keccak256(
        "CloseFundRequest(uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant ADD_MEMBER_TYPEHASH = keccak256(
        "AddMemberRequest(address newMember,uint256 newThreshold,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant REMOVE_MEMBER_TYPEHASH = keccak256(
        "RemoveMemberRequest(address oldMember,uint256 newThreshold,uint256 nonce,uint256 deadline)"
    );

    event VaultInitialized(address indexed owner, address[] members, uint256 threshold);
    event Deposit(address indexed sender, address indexed onBehalfOf, uint256 amount);
    event WithdrawExecuted(uint256 indexed nonce, address indexed to, uint256 amount, uint256 categoryId);
    event FundClosed();
    event MemberAdded(address indexed newMember, uint256 newThreshold);
    event MemberRemoved(address indexed oldMember, uint256 newThreshold);
    event ExpenseManagerUpdated(address indexed oldManager, address indexed newManager);

    modifier onlyActive() {
        require(state == VaultState.Active, "Quy khong o trang thai Hoat dong");
        _;
    }

    /**
     * @dev Khoi tao quy
     * @param _owner Dia chi cua nguoi tao quy (Owner)
     * @param _members Danh sach thanh vien ban dau
     * @param _threshold Nguong bieu quyet
     */
    function initialize(
        address _owner,
        address[] memory _members,
        uint256 _threshold 
    ) external initializer {
        __EIP712_init("SharedVault", "1");

        require(_owner != address(0), "Owner khong hop le");
        require(_members.length > 0, "Danh sach Member trong");
        require(_threshold > 0 && _threshold <= _members.length, "Nguong phe duyet khong hop le");
        
        owner = _owner;

        // Them cac thanh vien vao danh sach
        for (uint256 i = 0; i < _members.length; i++) {
            address member = _members[i];
            require(member != address(0), "Dia chi Member khong hop le");
            require(!isMember[member], "Member bi trung lap");
            isMember[member] = true;
            members.push(member);
        }
        
        // Rang buoc: Owner cung phai la mot Member de co the tham gia bieu quyet
        require(isMember[_owner], "Owner phai nam trong danh sach Member");

        threshold = _threshold;
        activeMemberCount = _members.length;
        state = VaultState.Active;
        
        emit VaultInitialized(_owner, _members, _threshold);
    }

    /**
     * @dev ROLE 3: Contributor - Nhan Ether truc tiep tu MetaMask
     */
    receive() external payable onlyActive {
        emit Deposit(msg.sender, msg.sender, msg.value);
    }

    /**
     * @dev ROLE 3: Contributor - Nhan Ether tu he thong nap ho (Vi Tong)
     */
    function depositFor(address _onBehalfOf) external payable onlyActive {
        require(msg.value > 0, "So luong nap phai lon hon 0");
        emit Deposit(msg.sender, _onBehalfOf, msg.value);
    }

    /**
     * @dev Xac minh chu ky (Tra ve true neu co su hien dien chu ky cua Owner)
     */
    function _verifySignatures(
        bytes32 structHash,
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) internal returns (bool hasOwnerSignature) {
        require(block.timestamp <= _deadline, "Chu ky da het han");
        require(!executedNonces[_nonce], "Nonce da duoc su dung");
        require(_signatures.length >= threshold, "Khong du so luong chu ky");

        bytes32 hash = _hashTypedDataV4(structHash);
        address lastSigner = address(0);
        
        for (uint256 i = 0; i < _signatures.length; i++) {
            address signer = hash.recover(_signatures[i]);
            require(isMember[signer], "Chu ky khong hop le (Khong phai Member)");
            
            // Kiem tra thu tu tang dan de chong trung lap chu ky
            require(uint160(signer) > uint160(lastSigner), "Chu ky bi trung lap hoac sai thu tu");
            
            // Phat hien chu ky cua Owner
            if (signer == owner) {
                hasOwnerSignature = true;
            }
            
            lastSigner = signer;
        }

        executedNonces[_nonce] = true;
    }

    /**
     * @dev Thiet lap hoac cap nhat dia chi ExpenseManager.
     *      Chi owner moi duoc phep thay doi.
     *      Truyen address(0) de tat kiem soat han muc (dung cho vault khong dung ExpenseManager).
     * @param _expenseManager Dia chi cua ExpenseManager da deploy
     */
    function setExpenseManager(address _expenseManager) external {
        require(msg.sender == owner, "SharedVault: Chi owner moi duoc thiet lap ExpenseManager");
        address old = address(expenseManager);
        expenseManager = IExpenseManager(_expenseManager);
        emit ExpenseManagerUpdated(old, _expenseManager);
    }

    /**
     * @dev ROLE 2: Member - Bieu quyet rut tien.
     *      Neu ExpenseManager duoc ket noi, se kiem tra han muc truoc khi rut.
     * @param _to Dia chi nhan tien
     * @param _amount So tien can rut (Wei)
     * @param _categoryId Ma danh muc chi tieu (tuong ung voi ExpenseManager va MongoDB)
     * @param _nonce So thu tu giao dich (chong replay attack)
     * @param _deadline Thoi han hop le cua chu ky
     * @param _signatures Mang chu ky cua cac Member
     */
    function executeWithdraw(
        address payable _to,
        uint256 _amount,
        uint256 _categoryId,
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) external nonReentrant onlyActive {
        require(address(this).balance >= _amount, "So du quy khong du");

        // Kiem tra han muc chi tieu truoc khi thuc hien giao dich
        // Checks-Effects: validateTransaction se revert neu vi pham -- an toan truoc khi transfer
        if (address(expenseManager) != address(0)) {
            expenseManager.validateTransaction(_categoryId, _amount);
        }

        bytes32 structHash = keccak256(
            abi.encode(WITHDRAW_TYPEHASH, _to, _amount, _categoryId, _nonce, _deadline)
        );
        
        _verifySignatures(structHash, _nonce, _deadline, _signatures);

        (bool success, ) = _to.call{value: _amount}("");
        require(success, "Giao dich chuyen tien that bai");

        emit WithdrawExecuted(_nonce, _to, _amount, _categoryId);
    }

    /**
     * @dev ROLE 1: Owner - Bieu quyet dong quy (BAT BUOC co chu ky cua Owner)
     */
    function executeCloseFund(
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) external nonReentrant onlyActive {
        require(address(this).balance == 0, "Phai rut het tien truoc khi dong quy");

        bytes32 structHash = keccak256(
            abi.encode(CLOSE_FUND_TYPEHASH, _nonce, _deadline)
        );
        
        bool hasOwnerSig = _verifySignatures(structHash, _nonce, _deadline, _signatures);
        require(hasOwnerSig, "Bat buoc phai co chu ky cua Owner de dong quy");

        state = VaultState.Closed;
        emit FundClosed();
    }

    /**
     * @dev ROLE 2: Member - Bieu quyet them thanh vien
     */
    function executeAddMember(
        address _newMember,
        uint256 _newThreshold,
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) external nonReentrant onlyActive {
        require(_newMember != address(0), "Dia chi khong hop le");
        require(!isMember[_newMember], "Da la Member");
        
        uint256 newTotalMembers = activeMemberCount + 1;
        require(_newThreshold > 0 && _newThreshold <= newTotalMembers, "Nguong moi khong hop le");

        bytes32 structHash = keccak256(
            abi.encode(ADD_MEMBER_TYPEHASH, _newMember, _newThreshold, _nonce, _deadline)
        );
        _verifySignatures(structHash, _nonce, _deadline, _signatures);

        isMember[_newMember] = true;
        members.push(_newMember);
        activeMemberCount = newTotalMembers;
        threshold = _newThreshold;

        emit MemberAdded(_newMember, _newThreshold);
    }

    /**
     * @dev ROLE 2: Member - Bieu quyet xoa thanh vien
     */
    function executeRemoveMember(
        address _oldMember,
        uint256 _newThreshold,
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) external nonReentrant onlyActive {
        require(isMember[_oldMember], "Khong phai Member hoac da bi xoa");
        require(_oldMember != owner, "Khong duoc phep xoa Owner cua quy");
        
        uint256 newTotalMembers = activeMemberCount - 1;
        require(_newThreshold > 0 && _newThreshold <= newTotalMembers, "Nguong moi khong hop le");

        bytes32 structHash = keccak256(
            abi.encode(REMOVE_MEMBER_TYPEHASH, _oldMember, _newThreshold, _nonce, _deadline)
        );
        _verifySignatures(structHash, _nonce, _deadline, _signatures);

        isMember[_oldMember] = false;
        activeMemberCount = newTotalMembers;
        threshold = _newThreshold;

        emit MemberRemoved(_oldMember, _newThreshold);
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}